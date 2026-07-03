-- Adds support for photos beyond the original front/back pair, plus a
-- "key photo" override so any photo (front, back, or an extra) can be
-- picked as the one shown on the collection card and detail page header.
-- Run this once in the Supabase SQL Editor.

create table if not exists public.knife_extra_photos (
  id uuid primary key default gen_random_uuid(),
  knife_id uuid not null references public.knives (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_knife_extra_photos_knife_id on public.knife_extra_photos (knife_id);

alter table public.knives
  add column if not exists key_photo_path text;

-- Stored at "<user_id>/knives/<knife_id>/extra/<photo_id>.<ext>" — same
-- first-path-segment convention as every other path in the knife-photos
-- bucket, so the existing storage RLS policies (20260702010000) already
-- cover these without changes.

alter table public.knife_extra_photos enable row level security;

drop policy if exists "knife_extra_photos_select_own" on public.knife_extra_photos;
create policy "knife_extra_photos_select_own" on public.knife_extra_photos
  for select using (auth.uid() = user_id);

drop policy if exists "knife_extra_photos_insert_own" on public.knife_extra_photos;
create policy "knife_extra_photos_insert_own" on public.knife_extra_photos
  for insert with check (auth.uid() = user_id);

drop policy if exists "knife_extra_photos_delete_own" on public.knife_extra_photos;
create policy "knife_extra_photos_delete_own" on public.knife_extra_photos
  for delete using (auth.uid() = user_id);
