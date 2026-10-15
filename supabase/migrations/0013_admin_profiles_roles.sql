-- ═══════════════════════════════════════════════════════════════
--  0013 — Admin profiles: username + role (admin | super_admin)
--  • public.admin_profiles mirrors auth.users with a username and a role.
--  • is_super_admin() now honours the role column (the original owner
--    email stays a permanent "root" super admin so you can never lock
--    yourself out).
--  • The table is READ-ONLY from the browser. All writes (create / edit
--    email / password / username / role / delete) go through the
--    `admin-users` Edge Function, which uses the service role and checks
--    that the caller is a super admin.
-- ═══════════════════════════════════════════════════════════════

-- 1. Profiles table
create table if not exists public.admin_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  username   text,
  role       text not null default 'admin' check (role in ('admin', 'super_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_profiles_username_key
  on public.admin_profiles (lower(username)) where username is not null;

-- 2. Super admin helper (SECURITY DEFINER so RLS policies can call it
--    without recursing into admin_profiles' own RLS)
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(lower(auth.jwt() ->> 'email') = 'mrby20647@gmail.com', false)
      or exists (
        select 1 from public.admin_profiles p
        where p.user_id = auth.uid() and p.role = 'super_admin'
      );
$$;

-- 3. Keep profiles in sync with auth.users
create or replace function public.sync_admin_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.admin_profiles (user_id, email, username, role)
    values (
      new.id,
      lower(new.email),
      nullif(new.raw_user_meta_data ->> 'username', ''),
      case when lower(new.email) = 'mrby20647@gmail.com' then 'super_admin' else 'admin' end
    )
    on conflict (user_id) do nothing;
  elsif tg_op = 'UPDATE' and new.email is distinct from old.email then
    update public.admin_profiles
       set email = lower(new.email), updated_at = now()
     where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_sync_profile on auth.users;
create trigger on_auth_user_sync_profile
  after insert or update of email on auth.users
  for each row execute function public.sync_admin_profile();

-- 4. Backfill existing accounts
insert into public.admin_profiles (user_id, email, username, role)
select u.id,
       lower(u.email),
       nullif(u.raw_user_meta_data ->> 'username', ''),
       case when lower(u.email) = 'mrby20647@gmail.com' then 'super_admin' else 'admin' end
from auth.users u
where u.email is not null
on conflict (user_id) do nothing;

-- 5. RLS: admins read their own profile, super admins read all.
alter table public.admin_profiles enable row level security;

drop policy if exists "read own or all if super" on public.admin_profiles;
create policy "read own or all if super"
  on public.admin_profiles for select
  to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

revoke all on public.admin_profiles from anon;
revoke insert, update, delete on public.admin_profiles from authenticated;
grant select on public.admin_profiles to authenticated;
