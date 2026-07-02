-- Adds photo storage for upload_batches: a private bucket for the two
-- full images (front/back) captured per batch, plus columns on
-- upload_batches pointing at them.
-- Run this once in the Supabase SQL Editor, after 20260702000000_knives_schema.sql.

alter table public.upload_batches
  add column if not exists front_image_path text,
  add column if not exists back_image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knife-photos', 'knife-photos', false, 20971520, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Photos are stored at "<user_id>/<batch_id>/front.<ext>" and
-- ".../back.<ext>", so RLS just checks the first path segment matches the
-- signed-in user (same ownership pattern as the knives/upload_batches tables).
drop policy if exists "knife_photos_select_own" on storage.objects;
create policy "knife_photos_select_own" on storage.objects
  for select using (
    bucket_id = 'knife-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "knife_photos_insert_own" on storage.objects;
create policy "knife_photos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'knife-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "knife_photos_update_own" on storage.objects;
create policy "knife_photos_update_own" on storage.objects
  for update using (
    bucket_id = 'knife-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'knife-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "knife_photos_delete_own" on storage.objects;
create policy "knife_photos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'knife-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
