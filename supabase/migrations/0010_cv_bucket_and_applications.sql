-- ═══════════════════════════════════════════════════════════════
--  0010 — CV Storage Bucket & Applications Table
--  Stores uploaded candidate CVs for verified recruiter vacancies.
-- ═══════════════════════════════════════════════════════════════

-- 1. Create a public storage bucket 'cv_files' for uploaded candidate CVs
insert into storage.buckets (id, name, public)
values ('cv_files', 'cv_files', true)
on conflict (id) do nothing;

-- 2. Storage Policies for 'cv_files' bucket
drop policy if exists "Public Upload CV Files" on storage.objects;
create policy "Public Upload CV Files"
on storage.objects for insert
to public
with check ( bucket_id = 'cv_files' );

drop policy if exists "Public Read CV Files" on storage.objects;
create policy "Public Read CV Files"
on storage.objects for select
to public
using ( bucket_id = 'cv_files' );

-- 3. Applications tracking table
create table if not exists public.vacancy_applications (
  id               uuid primary key default gen_random_uuid(),
  vacancy_id       uuid references public.vacancies(id) on delete set null,
  applicant_name   text not null,
  applicant_phone  text not null,
  applicant_email  text,
  cv_url           text not null,
  file_name        text,
  file_size        bigint,
  note             text,
  created_at       timestamptz not null default now()
);

create index if not exists vacancy_apps_vacancy_idx
  on public.vacancy_applications (vacancy_id, created_at desc);

alter table public.vacancy_applications enable row level security;

-- Public can submit applications
drop policy if exists "Public submit applications" on public.vacancy_applications;
create policy "Public submit applications"
on public.vacancy_applications for insert
to anon, authenticated
with check (
  char_length(btrim(applicant_name)) between 2 and 100
  and char_length(btrim(applicant_phone)) between 5 and 30
);

-- Admin can read and manage all applications
drop policy if exists "Admin manage applications" on public.vacancy_applications;
create policy "Admin manage applications"
on public.vacancy_applications for all
to authenticated
using (true)
with check (true);

grant select, insert on public.vacancy_applications to anon, authenticated;
