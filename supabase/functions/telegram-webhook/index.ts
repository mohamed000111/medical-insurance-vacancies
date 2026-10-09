// ═══════════════════════════════════════════════════════════════
//  telegram-webhook — Supabase Edge Function (Deno)
//
//  Receives Telegram channel posts and stores them verbatim:
//    • default                    → public.vacancies
//    • tagged #community / #reply → public.community_posts
//    • reply "#close" to a post   → hides that vacancy (is_active=false)
//    • edited posts               → update the existing row
//
//  Env vars (supabase secrets set ...):
//    TELEGRAM_WEBHOOK_SECRET  required — same value passed as secret_token to setWebhook
//    ALLOWED_CHAT_IDS         optional — comma-separated channel IDs to accept (e.g. -1001234567890)
//    SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
//  Deploy:  supabase functions deploy telegram-webhook --no-verify-jwt
// ═══════════════════════════════════════════════════════════════
import { createClient } from "jsr:@supabase/supabase-js@2";

const SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
const ALLOWED = (Deno.env.get("ALLOWED_CHAT_IDS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const COMMUNITY_TAG = /(^|\s)#(community|reply)\b/i;
const CLOSE_TAG = /^\s*#(close|closed|filled)\b/i;

interface TgMessage {
  message_id: number;
  date: number;
  edit_date?: number;
  chat: { id: number; title?: string; type: string };
  author_signature?: string;
  text?: string;
  caption?: string;
  reply_to_message?: TgMessage;
}

const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

async function handlePost(msg: TgMessage, isEdit: boolean) {
  const chatId = msg.chat.id;
  if (ALLOWED.length && !ALLOWED.includes(String(chatId))) return { skipped: "chat not allowed" };

  const raw = msg.text ?? msg.caption ?? "";
  if (!raw.trim()) return { skipped: "no text" };

  // "#close" as a reply → deactivate the replied-to vacancy; don't store the command itself.
  if (CLOSE_TAG.test(raw) && msg.reply_to_message) {
    const { error } = await db.from("vacancies")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("telegram_chat_id", chatId)
      .eq("telegram_message_id", msg.reply_to_message.message_id);
    if (error) throw error;
    return { closed: msg.reply_to_message.message_id };
  }

  const keys = { telegram_chat_id: chatId, telegram_message_id: msg.message_id };
  const createdAt = new Date(msg.date * 1000).toISOString();
  const updatedAt = isEdit ? new Date((msg.edit_date ?? Date.now() / 1000) * 1000).toISOString() : null;
  const isCommunity = COMMUNITY_TAG.test(raw);

  if (isCommunity) {
    const message = raw.replace(new RegExp(COMMUNITY_TAG.source, "gi"), "$1").trim();
    const { error } = await db.from("community_posts").upsert({
      ...keys,
      author_name: msg.author_signature || msg.chat.title || "Admin",
      message,
      is_approved: true, // posted by channel admins
      source: "telegram",
      ...(isEdit ? { updated_at: updatedAt } : { created_at: createdAt }),
    }, { onConflict: "telegram_chat_id,telegram_message_id" });
    if (error) throw error;
    // If an edit moved the post from vacancies → community, drop the stale vacancy.
    if (isEdit) await db.from("vacancies").delete().match(keys);
    return { stored: "community_posts" };
  }

  const { error } = await db.from("vacancies").upsert({
    ...keys,
    content: raw, // verbatim — line breaks, emojis and formatting preserved
    source: "telegram",
    ...(isEdit ? { updated_at: updatedAt } : { created_at: createdAt }),
  }, { onConflict: "telegram_chat_id,telegram_message_id" });
  if (error) throw error;
  if (isEdit) await db.from("community_posts").delete().match(keys);
  return { stored: "vacancies" };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Reject anything that isn't from Telegram (secret_token set via setWebhook).
  if (!SECRET || req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update: Record<string, unknown>;
  try {
    update = await req.json();
  } catch {
    return ok({ skipped: "invalid json" });
  }

  try {
    const post = (update.channel_post ?? update.edited_channel_post) as TgMessage | undefined;
    if (!post) return ok({ skipped: "not a channel post" });
    const result = await handlePost(post, Boolean(update.edited_channel_post));
    console.log(JSON.stringify({ update_id: update.update_id, ...result }));
    return ok(result);
  } catch (err) {
    // Log and still return 200 so Telegram doesn't retry the same update forever.
    console.error("telegram-webhook error:", err);
    return ok({ ok: false });
  }
});
