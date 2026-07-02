-- Adds fact-verified spec fields, kept separate from the existing
-- visually-estimated ones. Populated only when a grounded web-search
-- step (Gemini's Google Search grounding) runs after maker/model are
-- identified at high confidence.
-- Run this once in the Supabase SQL Editor, after 20260702030000_knives_identification.sql.

alter table public.knives
  add column if not exists blade_length_in_verified numeric(6, 3)
    check (blade_length_in_verified is null or blade_length_in_verified > 0),
  add column if not exists overall_length_open_in_verified numeric(6, 3)
    check (overall_length_open_in_verified is null or overall_length_open_in_verified > 0),
  add column if not exists blade_steel_verified text,
  add column if not exists spec_verification_sources jsonb,
  add column if not exists spec_verification_notes text;
