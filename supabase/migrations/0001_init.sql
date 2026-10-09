-- ═══════════════════════════════════════════════════════════════
--  MedInsure Hub — initial schema
--  Run in Supabase SQL Editor, or via `supabase db push`.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ───────────── Module A: vacancies ─────────────
create table if not exists public.vacancies (
  id                   uuid primary key default gen_random_uuid(),
  content              text not null,                        -- raw admin post, verbatim
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  -- additions (not in PRD): origin footer + dedupe / edit tracking
  source               text not null default 'telegram' check (source in ('telegram', 'web')),
  telegram_chat_id     bigint,
  telegram_message_id  bigint,
  updated_at           timestamptz
);

create unique index if not exists vacancies_tg_msg_uidx
  on public.vacancies (telegram_chat_id, telegram_message_id);
create index if not exists vacancies_active_created_idx
  on public.vacancies (created_at desc) where is_active;

-- ───────────── Module B: community_posts ─────────────
create table if not exists public.community_posts (
  id                   uuid primary key default gen_random_uuid(),
  author_name          text not null,
  message              text not null,
  is_approved          boolean not null default false,
  created_at           timestamptz not null default now(),
  source               text not null default 'web' check (source in ('telegram', 'web')),
  telegram_chat_id     bigint,
  telegram_message_id  bigint,
  updated_at           timestamptz
);

create unique index if not exists community_tg_msg_uidx
  on public.community_posts (telegram_chat_id, telegram_message_id);
create index if not exists community_approved_created_idx
  on public.community_posts (created_at desc) where is_approved;

-- ───────────── Row Level Security ─────────────
alter table public.vacancies       enable row level security;
alter table public.community_posts enable row level security;

-- Public can read only active vacancies. No public writes
-- (the Edge Function uses the service role key, which bypasses RLS).
drop policy if exists "public read active vacancies" on public.vacancies;
create policy "public read active vacancies"
  on public.vacancies for select
  to anon, authenticated
  using (is_active = true);

-- Public can read approved community posts.
drop policy if exists "public read approved posts" on public.community_posts;
create policy "public read approved posts"
  on public.community_posts for select
  to anon, authenticated
  using (is_approved = true);

-- Public can submit posts, but they always enter the moderation queue.
drop policy if exists "public submit posts for moderation" on public.community_posts;
create policy "public submit posts for moderation"
  on public.community_posts for insert
  to anon, authenticated
  with check (
    is_approved = false
    and source = 'web'
    and telegram_chat_id is null
    and telegram_message_id is null
    and char_length(btrim(author_name)) between 2 and 60
    and char_length(btrim(message)) between 3 and 2000
  );

-- Column-level hardening: anon may only set these columns on insert.
revoke insert on public.community_posts from anon, authenticated;
grant  insert (author_name, message, source) on public.community_posts to anon, authenticated;
grant  select on public.vacancies, public.community_posts to anon, authenticated;
