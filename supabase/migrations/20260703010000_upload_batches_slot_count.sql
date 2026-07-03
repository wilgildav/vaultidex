-- Records how many slots the batch's front/back source photos are divided
-- into: 5 for the standard flat-lay batch mode, 1 for single-knife mode
-- (where the whole photo IS the one knife, no slicing). The identification
-- pipeline re-crops from the original full-resolution photo using this
-- value, instead of always assuming 5 — without it, a single-knife photo
-- would get cropped down to its leftmost fifth.
-- Run this once in the Supabase SQL Editor, after 20260703000000_knives_model_number.sql.

alter table public.upload_batches
  add column if not exists slot_count smallint not null default 5
    check (slot_count between 1 and 5);
