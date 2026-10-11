-- ═══════════════════════════════════════════════════════════════
--  0008 — AI classifier audit log
--  Every channel post gets a verdict row here (vacancy or not).
--  Run in Supabase SQL Editor, or via `supabase db push`.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.classification_log (
  id                  uuid primary key default gen_random_uuid(),
  telegram_chat_id    bigint not null,
  telegram_message_id bigint not null,
  content             text not null,            -- the post that was classified, verbatim
  is_vacancy          boolean,                  -- null = classifier failed/disabled (fail-open stored it anyway)
  reason              text,                     -- one-line explanation from the model
  model               text,                     -- which model produced the verdict
  created_at          timestamptz not null default now(),
  updated_at          timestamptz,
  unique (telegram_chat_id, telegram_message_id)
);

create index if not exists classification_log_vacancy_idx
  on public.classification_log (is_vacancy, created_at desc);

-- Private audit table: RLS enabled with NO policies →
-- only the service role (the Edge Function) can read or write it.
alter table public.classification_log enable row level security;
