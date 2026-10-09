-- ═══════════════════════════════════════════════════════════════
--  0002 — Threaded replies (comments) on community posts
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.community_comments (
  id                   uuid primary key default gen_random_uuid(),
  post_id              uuid not null references public.community_posts (id) on delete cascade,
  author_name          text not null,
  message              text not null,
  is_approved          boolean not null default false,
  created_at           timestamptz not null default now(),
  source               text not null default 'web' check (source in ('telegram', 'web')),
  telegram_chat_id     bigint,
  telegram_message_id  bigint,
  updated_at           timestamptz
);

create index if not exists comments_post_created_idx
  on public.community_comments (post_id, created_at) where is_approved;
create unique index if not exists comments_tg_msg_uidx
  on public.community_comments (telegram_chat_id, telegram_message_id);

alter table public.community_comments enable row level security;

-- Public reads approved replies (only on approved parent posts).
drop policy if exists "public read approved comments" on public.community_comments;
create policy "public read approved comments"
  on public.community_comments for select
  to anon, authenticated
  using (
    is_approved = true
    and exists (select 1 from public.community_posts p where p.id = post_id and p.is_approved)
  );

-- Public can reply to approved posts; replies enter the moderation queue.
drop policy if exists "public submit comments for moderation" on public.community_comments;
create policy "public submit comments for moderation"
  on public.community_comments for insert
  to anon, authenticated
  with check (
    is_approved = false
    and source = 'web'
    and telegram_chat_id is null
    and telegram_message_id is null
    and char_length(btrim(author_name)) between 2 and 60
    and char_length(btrim(message)) between 2 and 1000
    and exists (select 1 from public.community_posts p where p.id = post_id and p.is_approved)
  );

revoke insert on public.community_comments from anon, authenticated;
grant  insert (post_id, author_name, message, source) on public.community_comments to anon, authenticated;
grant  select on public.community_comments to anon, authenticated;
