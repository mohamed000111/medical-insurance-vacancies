-- 1. Create a public bucket called "interview_files" if it doesn't exist
insert into storage.buckets (id, name, public)
values ('interview_files', 'interview_files', true)
on conflict (id) do nothing;

-- 2. Allow public access to read files in the "interview_files" bucket
create policy "Public Read Interview Files"
on storage.objects for select
to public
using ( bucket_id = 'interview_files' );

-- 3. Allow public (anon, authenticated) to upload files
create policy "Public Upload Interview Files"
on storage.objects for insert
to public
with check ( bucket_id = 'interview_files' );
