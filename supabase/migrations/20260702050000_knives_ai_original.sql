-- Preserves the AI's original identification separately from the
-- user-editable fields it seeds. The review queue lets a user overwrite
-- maker/model/pattern/blade_steel/handle_material/blade_length_in/
-- overall_length_open_in/notes when confirming a knife into the vault —
-- these ai_* columns are written once per identification run (mirroring
-- the main fields at that moment) and are never touched by a save, so a
-- later correction never destroys what the AI originally said.
-- Run this once in the Supabase SQL Editor, after 20260702040000_knives_spec_verification.sql.

alter table public.knives
  add column if not exists ai_maker text,
  add column if not exists ai_model text,
  add column if not exists ai_pattern text,
  add column if not exists ai_blade_steel text,
  add column if not exists ai_handle_material text,
  add column if not exists ai_blade_length_in numeric(6, 3)
    check (ai_blade_length_in is null or ai_blade_length_in > 0),
  add column if not exists ai_overall_length_open_in numeric(6, 3)
    check (ai_overall_length_open_in is null or ai_overall_length_open_in > 0),
  add column if not exists ai_notes text;
