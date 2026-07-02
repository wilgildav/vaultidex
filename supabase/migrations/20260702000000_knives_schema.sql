-- Vaultadex core schema: upload_batches + knives, with RLS.
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).

create extension if not exists pgcrypto;

-- ============================================================
-- upload_batches
-- One row per "batch" of photos a user uploads together. Each
-- batch can produce up to 5 knife entries (one per photo slot).
-- ============================================================
create table if not exists public.upload_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_upload_batches_user_id on public.upload_batches (user_id);

-- ============================================================
-- knives
-- One row per knife record. Optionally linked back to the
-- upload_batches row and photo slot (1-5) it came from.
-- ============================================================
create table if not exists public.knives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  upload_batch_id uuid references public.upload_batches (id) on delete set null,
  slot_position smallint check (slot_position is null or slot_position between 1 and 5),

  maker text,
  maker_confidence numeric(3, 2) check (maker_confidence is null or maker_confidence between 0 and 1),

  model text,
  model_confidence numeric(3, 2) check (model_confidence is null or model_confidence between 0 and 1),

  pattern text,

  blade_steel text,
  blade_steel_confidence numeric(3, 2) check (blade_steel_confidence is null or blade_steel_confidence between 0 and 1),

  handle_material text,
  handle_material_confidence numeric(3, 2) check (handle_material_confidence is null or handle_material_confidence between 0 and 1),

  era text, -- free text, e.g. "1920s-1930s" or "circa 1955"

  blade_length_in numeric(6, 3) check (blade_length_in is null or blade_length_in > 0),
  overall_length_open_in numeric(6, 3) check (overall_length_open_in is null or overall_length_open_in > 0),
  weight_oz numeric(6, 2) check (weight_oz is null or weight_oz > 0),

  notes text,

  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  visibility text not null default 'private' check (visibility in ('private', 'public')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_knives_batch_slot unique (upload_batch_id, slot_position)
);

create index if not exists idx_knives_user_id on public.knives (user_id);
create index if not exists idx_knives_upload_batch_id on public.knives (upload_batch_id);
create index if not exists idx_knives_public on public.knives (visibility) where visibility = 'public';

-- Keep updated_at current on every edit.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_knives_set_updated_at on public.knives;
create trigger trg_knives_set_updated_at
  before update on public.knives
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.upload_batches enable row level security;
alter table public.knives enable row level security;

-- upload_batches: owner-only, full access.
drop policy if exists "upload_batches_select_own" on public.upload_batches;
create policy "upload_batches_select_own" on public.upload_batches
  for select using (auth.uid() = user_id);

drop policy if exists "upload_batches_insert_own" on public.upload_batches;
create policy "upload_batches_insert_own" on public.upload_batches
  for insert with check (auth.uid() = user_id);

drop policy if exists "upload_batches_update_own" on public.upload_batches;
create policy "upload_batches_update_own" on public.upload_batches
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "upload_batches_delete_own" on public.upload_batches;
create policy "upload_batches_delete_own" on public.upload_batches
  for delete using (auth.uid() = user_id);

-- knives: owners can do everything with their own rows.
-- Anyone (including other users) can read a row once it's public.
drop policy if exists "knives_select_own_or_public" on public.knives;
create policy "knives_select_own_or_public" on public.knives
  for select using (auth.uid() = user_id or visibility = 'public');

drop policy if exists "knives_insert_own" on public.knives;
create policy "knives_insert_own" on public.knives
  for insert with check (auth.uid() = user_id);

drop policy if exists "knives_update_own" on public.knives;
create policy "knives_update_own" on public.knives
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "knives_delete_own" on public.knives;
create policy "knives_delete_own" on public.knives
  for delete using (auth.uid() = user_id);
