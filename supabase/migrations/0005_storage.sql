-- 1. Create a public bucket called "assets" if it doesn't exist
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

-- 2. Allow public access to read files in the "assets" bucket
create policy "Public Access"
on storage.objects for select
to public
using ( bucket_id = 'assets' );

-- 3. Allow authenticated users (Admins) to upload files to the "assets" bucket
create policy "Admin Upload"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'assets' );

-- 4. Allow authenticated users (Admins) to update/delete files in the "assets" bucket
create policy "Admin Update Delete"
on storage.objects for update
to authenticated
using ( bucket_id = 'assets' );

create policy "Admin Delete"
on storage.objects for delete
to authenticated
using ( bucket_id = 'assets' );
