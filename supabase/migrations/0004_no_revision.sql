-- ═══════════════════════════════════════════════════════════════
--  0004 — Community Hub Without Revision (Auto-Approval)
-- ═══════════════════════════════════════════════════════════════

-- 1. Alter table defaults so new posts/comments are approved by default
alter table public.community_posts alter column is_approved set default true;
alter table public.community_comments alter column is_approved set default true;

-- 2. Drop the old insert policies that required is_approved = false
drop policy if exists "public insert unapproved posts" on public.community_posts;
drop policy if exists "public insert unapproved comments" on public.community_comments;

-- 3. Create new insert policies that allow inserting approved posts/comments directly
create policy "public insert posts" on public.community_posts 
  for insert to anon, authenticated with check (is_approved = true);

create policy "public insert comments" on public.community_comments 
  for insert to anon, authenticated with check (is_approved = true);

-- 4. Automatically approve all existing pending posts and comments
update public.community_posts set is_approved = true where is_approved = false;
update public.community_comments set is_approved = true where is_approved = false;
