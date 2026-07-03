-- Adds model_number as its own tracked specification, distinct from the
-- descriptive model name (e.g. model "Trapper" vs. model_number "6318").
-- Gets the same treatment as maker/blade_steel/handle_material: a
-- confidence level and an ai_model_number snapshot of the AI's original
-- reading, kept alongside the editable column.
-- Run this once in the Supabase SQL Editor, after 20260702060000_knives_pattern_era_rework.sql.

alter table public.knives
  add column if not exists model_number text,
  add column if not exists model_number_confidence text
    check (model_number_confidence is null or model_number_confidence in ('high', 'medium', 'low')),
  add column if not exists ai_model_number text;
