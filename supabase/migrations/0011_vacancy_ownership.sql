-- ═══════════════════════════════════════════════════════════════
--  0011 — Vacancy ownership, super admin & scoped applications
--  • Every vacancy published from the admin portal records who posted it.
--  • Admins can only update/delete vacancies they published.
--  • Super admin (mrby20647@gmail.com) can manage everything.
--  • Admins only see applicants for their own vacancies.
--  Telegram webhook uses the service role → bypasses RLS (unchanged).
-- ═══════════════════════════════════════════════════════════════

-- 1. Super admin helper
create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce(lower(auth.jwt() ->> 'email') = 'mrby20647@gmail.com', false);
$$;

-- 2. Ownership columns
alter table public.vacancies
  add column if not exists posted_by       uuid references auth.users(id) on delete set null,
  add column if not exists posted_by_email text;

create index if not exists vacancies_posted_by_idx on public.vacancies (posted_by, created_at desc);

-- 3. Owner is stamped server-side (cannot be spoofed by the client)
create or replace function public.set_vacancy_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.posted_by       := auth.uid();
      new.posted_by_email := lower(auth.jwt() ->> 'email');
    end if;
  elsif tg_op = 'UPDATE' then
    -- ownership is immutable for everyone except the super admin
    if not public.is_super_admin() then
      new.posted_by       := old.posted_by;
      new.posted_by_email := old.posted_by_email;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists vacancies_set_owner on public.vacancies;
create trigger vacancies_set_owner
  before insert or update on public.vacancies
  for each row execute function public.set_vacancy_owner();

-- 4. Replace the old "any logged-in user can do anything" policy
drop policy if exists "admin full access vacancies" on public.vacancies;

drop policy if exists "admins read all vacancies" on public.vacancies;
create policy "admins read all vacancies"
  on public.vacancies for select
  to authenticated
  using (true);

drop policy if exists "admins insert own vacancies" on public.vacancies;
create policy "admins insert own vacancies"
  on public.vacancies for insert
  to authenticated
  with check (posted_by = auth.uid());

drop policy if exists "admins update own vacancies" on public.vacancies;
create policy "admins update own vacancies"
  on public.vacancies for update
  to authenticated
  using (posted_by = auth.uid() or public.is_super_admin())
  with check (posted_by = auth.uid() or public.is_super_admin());

drop policy if exists "admins delete own vacancies" on public.vacancies;
create policy "admins delete own vacancies"
  on public.vacancies for delete
  to authenticated
  using (posted_by = auth.uid() or public.is_super_admin());

-- 5. Don't expose poster emails to the public API
revoke select on public.vacancies from anon;
grant  select (id, content, is_active, created_at, source, updated_at) on public.vacancies to anon;

-- 6. Applications: admins see applicants of their own vacancies only
drop policy if exists "Admin manage applications" on public.vacancy_applications;

drop policy if exists "owners read applications" on public.vacancy_applications;
create policy "owners read applications"
  on public.vacancy_applications for select
  to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.vacancies v
      where v.id = vacancy_applications.vacancy_id
        and v.posted_by = auth.uid()
    )
  );

drop policy if exists "owners delete applications" on public.vacancy_applications;
create policy "owners delete applications"
  on public.vacancy_applications for delete
  to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.vacancies v
      where v.id = vacancy_applications.vacancy_id
        and v.posted_by = auth.uid()
    )
  );

-- Applicant PII must never be readable anonymously
revoke select on public.vacancy_applications from anon;
grant  select, delete on public.vacancy_applications to authenticated;
