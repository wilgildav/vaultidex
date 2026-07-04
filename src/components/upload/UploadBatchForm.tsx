"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createSlotKnives } from "@/lib/upload/createSlotKnives";
import { createSingleKnife } from "@/lib/upload/createSingleKnife";
import type { Knife } from "@/types/knife";
import BatchReview from "./BatchReview";
import PhotoCaptureSlot from "./PhotoCaptureSlot";

type Mode = "batch" | "single";

function extensionForType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export default function UploadBatchForm({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("batch");
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Each submission's knives are appended, not replacing the previous
  // entry — otherwise submitting a second batch before the first one's
  // background identification finishes would unmount its whole review
  // section, silently discarding it from view (the underlying rows are
  // untouched, but the user has no way to find them again from here).
  const [createdBatches, setCreatedBatches] = useState<Knife[][]>([]);

  const canSubmit = !!frontFile && !!backFile && !submitting;

  // Switching modes changes what the guide expects the photo to look like
  // (one centered knife vs. up to 5 laid out side by side), so a photo
  // already captured under the old mode wouldn't match the new guide —
  // clearing it prompts a recapture instead of silently uploading a
  // mismatched photo.
  function handleModeChange(next: Mode) {
    setMode(next);
    setFrontFile(null);
    setBackFile(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!frontFile || !backFile) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const { data: batch, error: batchError } = await supabase
      .from("upload_batches")
      .insert({ slot_count: mode === "single" ? 1 : 5 })
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
      const knives =
        mode === "single"
          ? await createSingleKnife({ supabase, userId, batchId: batch.id, frontFile, backFile })
          : await createSlotKnives({ supabase, userId, batchId: batch.id, frontFile, backFile });
      setCreatedBatches((prev) => [...prev, knives]);
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
      mode === "single"
        ? "Knife uploaded — 1 draft entry created. Feel free to upload another below."
        : "Batch uploaded — 5 draft knife entries created. Feel free to start another batch below.",
    );
    setFrontFile(null);
    setBackFile(null);
    setSubmitting(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="inline-flex w-fit rounded-full border border-black/[.08] p-0.5 dark:border-white/[.145]">
          {(["single", "batch"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                mode === m
                  ? "bg-foreground text-background"
                  : "text-zinc-600 hover:bg-black/[.04] dark:text-zinc-400 dark:hover:bg-[#1a1a1a]"
              }`}
            >
              {m === "single" ? "Single knife" : "Batch (up to 5)"}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {mode === "single"
            ? "One knife per upload, centered in the frame guide."
            : "Up to 5 knives laid out side by side, aligned to the numbered guides."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-8">
        <PhotoCaptureSlot
          label={mode === "single" ? "Front of your knife" : "Front of your knives"}
          file={frontFile}
          onChange={setFrontFile}
          mode={mode}
        />
        <PhotoCaptureSlot
          label={mode === "single" ? "Back of your knife" : "Back of your knives"}
          file={backFile}
          onChange={setBackFile}
          mode={mode}
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
          {submitting ? "Uploading…" : mode === "single" ? "Submit knife" : "Submit batch"}
        </button>
      </form>

      {createdBatches.map((knives) => (
        <BatchReview key={knives[0]?.id} initialKnives={knives} />
      ))}
    </>
  );
}
