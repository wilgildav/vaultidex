import type { SupabaseClient } from "@supabase/supabase-js";
import { cropIntoSlots } from "./cropSlots";

type CreateSlotKnivesArgs = {
  supabase: SupabaseClient;
  userId: string;
  batchId: string;
  frontFile: File;
  backFile: File;
};

// Crops the front/back batch photos into per-slot images, uploads each
// pair, and creates one draft knife row per slot linking back to them.
export async function createSlotKnives({
  supabase,
  userId,
  batchId,
  frontFile,
  backFile,
}: CreateSlotKnivesArgs): Promise<void> {
  const [frontSlots, backSlots] = await Promise.all([
    cropIntoSlots(frontFile),
    cropIntoSlots(backFile),
  ]);

  await Promise.all(
    frontSlots.map(async (frontBlob, index) => {
      const slotPosition = index + 1;
      const backBlob = backSlots[index];
      const frontPath = `${userId}/${batchId}/slot-${slotPosition}/front.jpg`;
      const backPath = `${userId}/${batchId}/slot-${slotPosition}/back.jpg`;

      const [frontUpload, backUpload] = await Promise.all([
        supabase.storage
          .from("knife-photos")
          .upload(frontPath, frontBlob, { contentType: "image/jpeg" }),
        supabase.storage
          .from("knife-photos")
          .upload(backPath, backBlob, { contentType: "image/jpeg" }),
      ]);

      if (frontUpload.error) throw frontUpload.error;
      if (backUpload.error) throw backUpload.error;

      const { error: insertError } = await supabase.from("knives").insert({
        upload_batch_id: batchId,
        slot_position: slotPosition,
        front_image_path: frontPath,
        back_image_path: backPath,
      });
      if (insertError) throw insertError;
    }),
  );
}
