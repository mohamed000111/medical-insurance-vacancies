// ═══════════════════════════════════════════════════════════════
//  admin-users — Supabase Edge Function (Deno)
//
//  Super-admin-only account management for the admin portal:
//    list    → all admin accounts (auth.users + public.admin_profiles)
//    create  → new account { email, password, username?, role }
//    update  → edit { email?, password?, username?, role? } of an account
//    delete  → remove an account (their vacancies are kept, owner set to NULL)
//
//  Security:
//    • Caller's JWT is verified inside the function (works with the new
//      asymmetric JWT signing keys, hence --no-verify-jwt on deploy).
//    • Caller must be a super admin (root email or role = 'super_admin').
//    • The root account can't be deleted or demoted, and only the root
//      account itself may change its own email/password/username.
//    • You can't delete or demote yourself.
//
//  Requires migration 0013_admin_profiles_roles.sql.
//  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
//  Deploy:  supabase functions deploy admin-users --no-verify-jwt
//  (or paste this file in Dashboard → Edge Functions → New function → admin-users)
// ═══════════════════════════════════════════════════════════════
import { createClient } from "jsr:@supabase/supabase-js@2";

const ROOT_EMAIL = "mrby20647@gmail.com";
const ROLES = ["admin", "super_admin"] as const;
type Role = (typeof ROLES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const isRoot = (email?: string | null) => (email || "").toLowerCase() === ROOT_EMAIL;

function cleanUsername(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (!USERNAME_RE.test(s)) {
    throw new HttpError(400, "Username must be 3–32 characters: letters, numbers, dot, dash or underscore.");
  }
  return s;
}

function cleanEmail(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(s)) throw new HttpError(400, "Please enter a valid email address.");
  return s;
}

function cleanPassword(v: unknown): string {
  const s = String(v ?? "");
  if (s.length < 6) throw new HttpError(400, "Password must be at least 6 characters.");
  return s;
}

function cleanRole(v: unknown): Role {
  const s = String(v ?? "admin");
  if (!ROLES.includes(s as Role)) throw new HttpError(400, "Role must be 'admin' or 'super_admin'.");
  return s as Role;
}

async function getProfile(userId: string) {
  const { data } = await admin
    .from("admin_profiles")
    .select("user_id, email, username, role")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

async function assertUsernameFree(username: string | null, exceptUserId?: string) {
  if (!username) return;
  let q = admin.from("admin_profiles").select("user_id").ilike("username", username);
  if (exceptUserId) q = q.neq("user_id", exceptUserId);
  const { data } = await q.limit(1);
  if (data && data.length) throw new HttpError(409, `Username "${username}" is already taken.`);
}

async function countSuperAdmins(): Promise<number> {
  const { count } = await admin
    .from("admin_profiles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "super_admin");
  return count ?? 0;
}

/* ───────────── Actions ───────────── */

async function listUsers() {
  const users: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new HttpError(500, error.message);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }

  const { data: profiles, error: pErr } = await admin
    .from("admin_profiles")
    .select("user_id, username, role");
  if (pErr) throw new HttpError(500, `admin_profiles: ${pErr.message} (did you run migration 0013?)`);
  const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  return users
    .filter((u) => u.email)
    .map((u) => {
      const p = byId.get(u.id);
      return {
        id: u.id,
        email: u.email,
        username: p?.username ?? u.user_metadata?.username ?? null,
        role: isRoot(u.email) ? "super_admin" : (p?.role ?? "admin"),
        is_root: isRoot(u.email),
        email_confirmed: !!u.email_confirmed_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        created_at: u.created_at,
      };
    })
    .sort((a, b) => Number(b.is_root) - Number(a.is_root) || a.email.localeCompare(b.email));
}

async function createUser(body: any) {
  const email = cleanEmail(body.email);
  const password = cleanPassword(body.password);
  const username = cleanUsername(body.username);
  const role = cleanRole(body.role);
  await assertUsernameFree(username);

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // created by a super admin → no confirmation email needed
    user_metadata: username ? { username } : {},
  });
  if (error) throw new HttpError(400, error.message);

  const { error: pErr } = await admin.from("admin_profiles").upsert({
    user_id: data.user.id,
    email,
    username,
    role: isRoot(email) ? "super_admin" : role,
    updated_at: new Date().toISOString(),
  });
  if (pErr) throw new HttpError(500, pErr.message);

  return { id: data.user.id };
}

async function updateUser(body: any, caller: { id: string; email: string }) {
  const id = String(body.id ?? "");
  if (!id) throw new HttpError(400, "Missing account id.");

  const { data: existing, error: getErr } = await admin.auth.admin.getUserById(id);
  if (getErr || !existing?.user) throw new HttpError(404, "Account not found.");
  const target = existing.user;
  const targetIsRoot = isRoot(target.email);
  const isSelf = id === caller.id;

  if (targetIsRoot && !isRoot(caller.email)) {
    throw new HttpError(403, "Only the root super admin can edit the root account.");
  }

  const authPatch: Record<string, unknown> = {};
  const profilePatch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.email !== undefined && String(body.email).trim().toLowerCase() !== (target.email || "").toLowerCase()) {
    if (targetIsRoot) {
      throw new HttpError(400, "The root account's email is hard-coded as the permanent super admin and can't be changed here.");
    }
    const email = cleanEmail(body.email);
    authPatch.email = email;
    authPatch.email_confirm = true;
    profilePatch.email = email;
  }

  if (body.password !== undefined && String(body.password) !== "") {
    authPatch.password = cleanPassword(body.password);
  }

  if (body.username !== undefined) {
    const username = cleanUsername(body.username);
    await assertUsernameFree(username, id);
    profilePatch.username = username;
    authPatch.user_metadata = { ...(target.user_metadata ?? {}), username };
  }

  if (body.role !== undefined) {
    const role = cleanRole(body.role);
    const current = (await getProfile(id))?.role ?? "admin";
    if (role !== current) {
      if (targetIsRoot) throw new HttpError(400, "The root account is always a super admin.");
      if (isSelf && role !== "super_admin") throw new HttpError(400, "You can't remove your own super admin role.");
      if (current === "super_admin" && role === "admin" && (await countSuperAdmins()) <= 1) {
        throw new HttpError(400, "At least one super admin must remain.");
      }
      profilePatch.role = role;
    }
  }

  if (Object.keys(authPatch).length) {
    const { error } = await admin.auth.admin.updateUserById(id, authPatch);
    if (error) throw new HttpError(400, error.message);
  }

  const { error: pErr } = await admin
    .from("admin_profiles")
    .upsert({ user_id: id, email: (profilePatch.email as string) ?? target.email, ...profilePatch });
  if (pErr) throw new HttpError(500, pErr.message);

  return { id };
}

async function deleteUser(body: any, caller: { id: string }) {
  const id = String(body.id ?? "");
  if (!id) throw new HttpError(400, "Missing account id.");
  if (id === caller.id) throw new HttpError(400, "You can't delete your own account.");

  const { data: existing, error: getErr } = await admin.auth.admin.getUserById(id);
  if (getErr || !existing?.user) throw new HttpError(404, "Account not found.");
  if (isRoot(existing.user.email)) throw new HttpError(400, "The root super admin can't be deleted.");

  const profile = await getProfile(id);
  if (profile?.role === "super_admin" && (await countSuperAdmins()) <= 1) {
    throw new HttpError(400, "At least one super admin must remain.");
  }

  // vacancies.posted_by is ON DELETE SET NULL; admin_profiles cascades.
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw new HttpError(400, error.message);
  return { id };
}

/* ───────────── Handler ───────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) throw new HttpError(401, "Not signed in.");

    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who?.user) throw new HttpError(401, "Session expired. Please sign in again.");
    const caller = { id: who.user.id, email: (who.user.email || "").toLowerCase() };

    const callerIsSuper = isRoot(caller.email) || (await getProfile(caller.id))?.role === "super_admin";
    if (!callerIsSuper) throw new HttpError(403, "Only super admins can manage admin accounts.");

    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "list":   return json({ users: await listUsers() });
      case "create": return json(await createUser(body));
      case "update": return json(await updateUser(body, caller));
      case "delete": return json(await deleteUser(body, caller));
      default:       throw new HttpError(400, "Unknown action.");
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    console.error("admin-users error:", err);
    return json({ error: (err as Error).message || "Unexpected error" }, status);
  }
});
