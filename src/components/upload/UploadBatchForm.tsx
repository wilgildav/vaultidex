"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createSlotKnives } from "@/lib/upload/createSlotKnives";
import type { Knife } from "@/types/knife";
import BatchReview from "./BatchReview";
import PhotoCaptureSlot from "./PhotoCaptureSlot";

function extensionForType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export default function UploadBatchForm({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdKnives, setCreatedKnives] = useState<Knife[] | null>(null);

  const canSubmit = !!frontFile && !!backFile && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!frontFile || !backFile) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const { data: batch, error: batchError } = await supabase
      .from("upload_batches")
      .insert({})
      .select()
      .single();

    if (batchError || !batch) {
      setError(batchError?.message ?? "Could not start a new batch.");
      setSubmitting(false);
      return;
    }

    const frontPath = `${userId}/${batch.id}/front.${extensionForType(frontFile.type)}`;
    const backPath = `${userId}/${batch.id}/back.${extensionForType(backFile.type)}`;

    const [frontUpload, backUpload] = await Promise.all([
      supabase.storage
        .from("knife-photos")
        .upload(frontPath, frontFile, { contentType: frontFile.type }),
      supabase.storage
        .from("knife-photos")
        .upload(backPath, backFile, { contentType: backFile.type }),
    ]);

    if (frontUpload.error || backUpload.error) {
      setError(
        frontUpload.error?.message ??
          backUpload.error?.message ??
          "Photo upload failed.",
      );
      await supabase.from("upload_batches").delete().eq("id", batch.id);
      setSubmitting(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("upload_batches")
      .update({ front_image_path: frontPath, back_image_path: backPath })
      .eq("id", batch.id);

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    try {
      const knives = await createSlotKnives({
        supabase,
        userId,
        batchId: batch.id,
        frontFile,
        backFile,
      });
      setCreatedKnives(knives);
    } catch (slotError) {
      setError(
        slotError instanceof Error
          ? slotError.message
          : "Could not create knife entries for this batch.",
      );
      setSubmitting(false);
      return;
    }

    setSuccess(
      "Batch uploaded — 5 draft knife entries created. Feel free to start another batch below.",
    );
    setFrontFile(null);
    setBackFile(null);
    setSubmitting(false);
    router.refresh();
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        <PhotoCaptureSlot
          label="Front of your knives"
          file={frontFile}
          onChange={setFrontFile}
        />
        <PhotoCaptureSlot
          label="Back of your knives"
          file={backFile}
          onChange={setBackFile}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && (
          <p className="text-sm text-green-600 dark:text-green-500">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="flex h-12 w-full items-center justify-center rounded-full bg-foreground px-5 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {submitting ? "Uploading…" : "Submit batch"}
        </button>
      </form>

      {createdKnives && <BatchReview initialKnives={createdKnives} />}
    </>
  );
}
