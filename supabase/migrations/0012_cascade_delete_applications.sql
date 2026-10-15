-- ═══════════════════════════════════════════════════════════════
--  0012 — Cascade delete applications and CV files on vacancy delete
--  • Cascades vacancy deletion to public.vacancy_applications
--  • Grants storage delete policy on 'cv_files' bucket for authenticated admins
-- ═══════════════════════════════════════════════════════════════

-- 1. Ensure foreign key has ON DELETE CASCADE
do $$
declare
  r record;
begin
  for r in (
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = 'vacancy_applications'
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name = 'vacancy_id'
  ) loop
    execute format('alter table public.vacancy_applications drop constraint %I', r.constraint_name);
  end loop;
end $$;

alter table public.vacancy_applications
  add constraint vacancy_applications_vacancy_id_fkey
  foreign key (vacancy_id) references public.vacancies(id) on delete cascade;

-- 2. Storage policy allowing authenticated admins to delete CV files from cv_files bucket
drop policy if exists "Admin Delete CV Files" on storage.objects;
create policy "Admin Delete CV Files"
on storage.objects for delete
to authenticated
using ( bucket_id = 'cv_files' );

-- 3. Ensure authenticated role can delete applications
grant delete on public.vacancy_applications to authenticated;
