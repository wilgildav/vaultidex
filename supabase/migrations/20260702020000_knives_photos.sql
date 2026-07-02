-- Adds photo storage for individual knife slot crops. When an
-- upload_batches submission is sliced into per-slot draft knives, each
-- knife gets its own cropped front/back image.
-- Run this once in the Supabase SQL Editor, after 20260702010000_upload_batches_photos.sql.

alter table public.knives
  add column if not exists front_image_path text,
  add column if not exists back_image_path text;

-- No bucket or policy changes needed: slot crops are stored at
-- "<user_id>/<batch_id>/slot-<n>/front.jpg" (and back.jpg) in the existing
-- knife-photos bucket, and the existing storage RLS policies already scope
-- access by the first path segment (the user id), regardless of depth.
