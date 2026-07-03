-- Two schema changes to public.knives:
--   1. Drop "pattern" entirely (both the editable column and its AI-original
--      snapshot) — no longer tracked anywhere in the identification
--      pipeline or review queue.
--   2. Replace the free-text "era" column with structured year_start /
--      year_end integer columns, plus a confidence level for that estimate
--      (matching the badge treatment maker/model/blade_steel/handle_material
--      already get) and an ai_year_start/ai_year_end snapshot pair (matching
--      the other ai_* original-value columns).
-- Run this once in the Supabase SQL Editor, after 20260702050000_knives_ai_original.sql.

alter table public.knives
  drop column if exists pattern,
  drop column if exists ai_pattern,
  drop column if exists era;

alter table public.knives
  add column if not exists year_start integer,
  add column if not exists year_end integer,
  add column if not exists year_confidence text
    check (year_confidence is null or year_confidence in ('high', 'medium', 'low')),
  add column if not exists ai_year_start integer,
  add column if not exists ai_year_end integer;
