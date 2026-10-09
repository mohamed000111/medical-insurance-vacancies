-- ═══════════════════════════════════════════════════════════════
--  0003 — Admin Dashboard Access
-- ═══════════════════════════════════════════════════════════════

-- IMPORTANT: You must disable public signups in your Supabase dashboard!
-- Go to Authentication -> Providers -> Email -> Turn OFF "Enable Signups".
-- Then, manually create your admin user under Authentication -> Users.

-- Grant full control over vacancies to any logged-in (authenticated) user
create policy "admin full access vacancies" on public.vacancies
  for all to authenticated using (true) with check (true);

-- Grant full control over community posts to authenticated users
create policy "admin full access community posts" on public.community_posts
  for all to authenticated using (true) with check (true);

-- Grant full control over community comments to authenticated users
create policy "admin full access comments" on public.community_comments
  for all to authenticated using (true) with check (true);
