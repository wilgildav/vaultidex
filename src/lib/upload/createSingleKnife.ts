import type { SupabaseClient } from "@supabase/supabase-js";
import type { Knife } from "@/types/knife";

type CreateSingleKnifeArgs = {
  supabase: SupabaseClient;
  userId: string;
  batchId: string;
  frontFile: File;
  backFile: File;
};

// Single-knife mode counterpart to createSlotKnives: the front/back
// photos ARE the one knife's crop directly, so there's no slicing —
// just upload them as slot 1 and create the single draft row.
export async function createSingleKnife({
  supabase,
  userId,
  batchId,
  frontFile,
  backFile,
}: CreateSingleKnifeArgs): Promise<Knife[]> {
  const frontPath = `${userId}/${batchId}/slot-1/front.jpg`;
  const backPath = `${userId}/${batchId}/slot-1/back.jpg`;

  const [frontUpload, backUpload] = await Promise.all([
    supabase.storage
      .from("knife-photos")
      .upload(frontPath, frontFile, { contentType: frontFile.type }),
    supabase.storage
      .from("knife-photos")
      .upload(backPath, backFile, { contentType: backFile.type }),
  ]);

  if (frontUpload.error) throw frontUpload.error;
  if (backUpload.error) throw backUpload.error;

  const { data: inserted, error: insertError } = await supabase
    .from("knives")
    .insert({
      upload_batch_id: batchId,
      slot_position: 1,
      front_image_path: frontPath,
      back_image_path: backPath,
    })
    .select()
    .single();
  if (insertError) throw insertError;

  return [inserted as Knife];
}
