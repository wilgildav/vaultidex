-- Supports the Gemini identification pipeline:
--   1. Confidence columns switch from a 0-1 number to a high/medium/low
--      label, since that's what Gemini is asked to return.
--   2. status gains a third value, 'not_identified', for slots where no
--      knife was clearly present (instead of guessing).
-- Run this once in the Supabase SQL Editor, after 20260702020000_knives_photos.sql.

alter table public.knives drop constraint if exists knives_maker_confidence_check;
alter table public.knives drop constraint if exists knives_model_confidence_check;
alter table public.knives drop constraint if exists knives_blade_steel_confidence_check;
alter table public.knives drop constraint if exists knives_handle_material_confidence_check;

alter table public.knives
  alter column maker_confidence type text using maker_confidence::text,
  alter column model_confidence type text using model_confidence::text,
  alter column blade_steel_confidence type text using blade_steel_confidence::text,
  alter column handle_material_confidence type text using handle_material_confidence::text;

alter table public.knives
  add constraint knives_maker_confidence_check
    check (maker_confidence is null or maker_confidence in ('high', 'medium', 'low')),
  add constraint knives_model_confidence_check
    check (model_confidence is null or model_confidence in ('high', 'medium', 'low')),
  add constraint knives_blade_steel_confidence_check
    check (blade_steel_confidence is null or blade_steel_confidence in ('high', 'medium', 'low')),
  add constraint knives_handle_material_confidence_check
    check (handle_material_confidence is null or handle_material_confidence in ('high', 'medium', 'low'));

alter table public.knives drop constraint if exists knives_status_check;
alter table public.knives
  add constraint knives_status_check
    check (status in ('draft', 'confirmed', 'not_identified'));
