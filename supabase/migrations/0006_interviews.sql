-- ═══════════════════════════════════════════════════════════════
--  0006 — Interview Experiences
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.interviews (
  id                   uuid primary key default gen_random_uuid(),
  company_name         text not null,
  position             text not null,
  topics               text not null,
  pdf_link             text,
  hr_name              text,
  hr_phone             text,
  hr_email             text,
  is_approved          boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz
);

create index if not exists interviews_approved_created_idx
  on public.interviews (created_at desc) where is_approved;

alter table public.interviews enable row level security;

-- Public can read approved interviews.
drop policy if exists "public read approved interviews" on public.interviews;
create policy "public read approved interviews"
  on public.interviews for select
  to anon, authenticated
  using (is_approved = true);

-- Public can submit interviews.
drop policy if exists "public insert interviews" on public.interviews;
create policy "public insert interviews"
  on public.interviews for insert
  to anon, authenticated
  with check (
    is_approved = true
    and char_length(btrim(company_name)) between 2 and 100
    and char_length(btrim(position)) between 2 and 100
    and char_length(btrim(topics)) between 3 and 2000
  );

-- Column-level permissions
revoke insert on public.interviews from anon, authenticated;
grant insert (company_name, position, topics, pdf_link, hr_name, hr_phone, hr_email, is_approved) on public.interviews to anon, authenticated;
grant select on public.interviews to anon, authenticated;
