// ═══════════════════════════════════════════════════════════════
//  telegram-webhook — Supabase Edge Function (Deno)
//
//  Receives Telegram channel posts, classifies each one with a free
//  LLM (Groq by default), and stores vacancies verbatim:
//    • classified as vacancy       → public.vacancies (content kept verbatim)
//    • NOT a vacancy               → skipped; verdict saved to public.classification_log
//    • tagged #community / #reply  → public.community_posts (tag wins over classifier)
//    • reply "#close" to a post    → hides that vacancy (is_active=false)
//    • edited posts                → re-classified; rows added/updated/removed
//
//  Fail-open policy: if the classifier is disabled or errors out, the post is
//  stored as a vacancy (nothing is ever lost) and the log records why.
//
//  Env vars (supabase secrets set ... — or Dashboard → Edge Functions → Secrets):
//    TELEGRAM_WEBHOOK_SECRET  required — same value passed as secret_token to setWebhook
//    ALLOWED_CHAT_IDS         optional — comma-separated channel IDs to accept (e.g. -1001234567890)
//    CLASSIFIER_API_KEY       optional — enables the AI classifier; free Groq key:
//                              https://console.groq.com/keys  (unset = store everything, as before)
//    CLASSIFIER_MODEL         optional — default: openai/gpt-oss-120b (Groq, free tier)
//    CLASSIFIER_BASE_URL      optional — default: https://api.groq.com/openai/v1
//                              (any OpenAI-compatible endpoint works, e.g. Gemini free tier:
//                               https://generativelanguage.googleapis.com/v1beta/openai/)
//    SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
//  Deploy:  supabase functions deploy telegram-webhook --no-verify-jwt
//  (or paste this file in Dashboard → Edge Functions → telegram-webhook → Deploy)
// ═══════════════════════════════════════════════════════════════
import { createClient } from "jsr:@supabase/supabase-js@2";

const SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "test123";
const ALLOWED = (Deno.env.get("ALLOWED_CHAT_IDS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

// ── AI classifier (any OpenAI-compatible endpoint; Groq free tier by default) ──
const CLASSIFIER_API_KEY = Deno.env.get("CLASSIFIER_API_KEY") ?? "";
const CLASSIFIER_MODEL = Deno.env.get("CLASSIFIER_MODEL") || "openai/gpt-oss-120b";
const CLASSIFIER_BASE_URL =
  (Deno.env.get("CLASSIFIER_BASE_URL") || "https://api.groq.com/openai/v1").replace(/\/$/, "");

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const COMMUNITY_TAG = /(^|\s)#(community|reply)\b/i;
const CLOSE_TAG = /^\s*#(close|closed|filled)\b/i;

const CLASSIFIER_SYSTEM = `\
You classify posts from a bilingual (Arabic/English) Telegram channel about medical \
insurance careers in Egypt. The admin posts job vacancies there; occasional other \
posts appear too.

Reply with JSON only, no prose: {"is_vacancy": true or false, "reason": "one short sentence"}.

is_vacancy = true ONLY for posts recruiting for a job or paid role (full-time, \
part-time, shifts or freelance), such as: claims specialist, medical representative, \
medical auditor, underwriter, pharmacy/clinic roles, customer service, sales, \
collections — or any post asking applicants to send a CV or WhatsApp message to apply.

is_vacancy = false for: company or service promotions, insurance offers, courses and \
trainings, news or legal updates, congratulations and holiday greetings, general \
discussion, thank-you messages, spam.

When genuinely ambiguous, return true — a real vacancy must never be skipped.`;

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

interface Verdict {
  is_vacancy: boolean | null;
  reason: string;
}

const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

function parseVerdict(raw: string): Verdict {
  // Strip reasoning / think tags if present (e.g. reasoning models)
  const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  // Lenient parse: strip code fences, take the outermost braces.
  const cleaned = stripped.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let jsonStr = "";
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    jsonStr = cleaned.slice(start, end + 1);
  }

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(jsonStr);
  } catch {
    // Fallback: look specifically for a JSON block containing "is_vacancy"
    const match = cleaned.match(/\{[^{}]*"is_vacancy"[^{}]*\}/);
    if (match) {
      obj = JSON.parse(match[0]);
    } else {
      throw new Error(`no JSON in classifier output: ${raw.slice(0, 120)}`);
    }
  }

  // Bias rule (FR-6): only false if explicitly false or "false"; otherwise true.
  const isFalse = obj.is_vacancy === false || String(obj.is_vacancy).toLowerCase() === "false";
  return {
    is_vacancy: !isFalse,
    reason: String(obj.reason ?? "").slice(0, 300),
  };
}

async function classifyVacancy(text: string): Promise<Verdict> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${CLASSIFIER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${CLASSIFIER_API_KEY}`,
          "Content-Type": "application/json",
          // Groq sits behind Cloudflare, which blocks default library user-agents.
          "User-Agent": "MedInsureHub-Classifier/1.0",
        },
        body: JSON.stringify({
          model: CLASSIFIER_MODEL,
          temperature: 0,
          max_tokens: 512, // headroom for reasoning models before the JSON answer
          messages: [
            { role: "system", content: CLASSIFIER_SYSTEM },
            { role: "user", content: text },
          ],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`classifier http ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      return parseVerdict(String(data?.choices?.[0]?.message?.content ?? ""));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function logVerdict(
  chatId: number,
  messageId: number,
  content: string,
  verdict: Verdict,
  isEdit: boolean,
) {
  const { error } = await db.from("classification_log").upsert({
    telegram_chat_id: chatId,
    telegram_message_id: messageId,
    content: content.slice(0, 10000),
    is_vacancy: verdict.is_vacancy,
    reason: verdict.reason,
    model: CLASSIFIER_API_KEY ? CLASSIFIER_MODEL : null,
    ...(isEdit ? { updated_at: new Date().toISOString() } : {}),
  }, { onConflict: "telegram_chat_id,telegram_message_id" });
  if (error) console.error("classification_log upsert error:", error); // never fail the post over the audit log
}

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

  // ── AI classification: is this actually a job vacancy? ──
  let verdict: Verdict;
  if (!CLASSIFIER_API_KEY) {
    verdict = { is_vacancy: null, reason: "classifier disabled — stored as before" };
  } else {
    try {
      verdict = await classifyVacancy(raw);
    } catch (err) {
      // Fail-open: never lose an admin post because the classifier hiccuped.
      const errMsg = err instanceof Error ? err.message : String(err);
      verdict = { is_vacancy: null, reason: `classifier failed: ${errMsg}` };
    }
  }
  await logVerdict(chatId, msg.message_id, raw, verdict, isEdit);

  if (verdict.is_vacancy === false) {
    // An edit turned the post into non-vacancy content → hide the old vacancy row.
    if (isEdit) await db.from("vacancies").delete().match(keys);
    return { skipped: "not a vacancy", reason: verdict.reason };
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
    // ── Direct override action from Helper Application ──
    if (update.action === "override") {
      const chatId = Number(update.telegram_chat_id || -1002698758122);
      const msgId = Number(update.telegram_message_id);
      const isVac = Boolean(update.is_vacancy);
      const reason = String(update.reason || "Manual override from helper app");
      const keys = { telegram_chat_id: chatId, telegram_message_id: msgId };

      if (!isVac) {
        // Set inactive and delete from vacancies
        await db.from("vacancies").update({ is_active: false, updated_at: new Date().toISOString() }).match(keys);
        await db.from("vacancies").delete().match(keys);
      } else if (update.content) {
        await db.from("vacancies").upsert({
          ...keys,
          content: String(update.content),
          is_active: true,
          source: "telegram",
          updated_at: new Date().toISOString(),
        }, { onConflict: "telegram_chat_id,telegram_message_id" });
      }
      await logVerdict(chatId, msgId, String(update.content || ""), { is_vacancy: isVac, reason }, true);
      return ok({ overridden: true, is_vacancy: isVac, message_id: msgId });
    }

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
