-- Adds a favorite flag, set from the knife detail page.
-- Run this once in the Supabase SQL Editor.

alter table public.knives
  add column if not exists favorite boolean not null default false;

create index if not exists idx_knives_favorite on public.knives (user_id, favorite) where favorite;
