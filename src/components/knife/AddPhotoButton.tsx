"use client";

import { useRef, useState } from "react";
import { useCameraCapture } from "@/components/camera/useCameraCapture";

export type UploadedPhoto = { id: string; path: string; url?: string };

export default function AddPhotoButton({
  knifeId,
  onUploaded,
  sizeClassName = "h-28 w-24",
}: {
  knifeId: string;
  onUploaded: (photo: UploadedPhoto) => void;
  sizeClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { videoRef, cameraOpen, cameraError, openCamera, closeCamera, capturePhoto } =
    useCameraCapture();

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`/api/knives/${knifeId}/photos`, {
      method: "POST",
      body: formData,
    });
    const body = await res.json();

    if (!res.ok) {
      setError(body.error ?? "Could not upload photo.");
    } else {
      onUploaded(body.photo);
    }
    setUploading(false);
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await uploadFile(file);
  }

  async function handleCapture() {
    const file = await capturePhoto(`extra-${Date.now()}.jpg`);
    if (file) await uploadFile(file);
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex flex-col items-center justify-center gap-1.5 rounded border-2 border-dashed border-black/[.15] p-1.5 dark:border-white/[.2] ${sizeClassName}`}
      >
        <button
          type="button"
          onClick={openCamera}
          disabled={uploading}
          className="flex h-7 w-full items-center justify-center rounded-full bg-foreground px-2 text-[10px] font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          Camera
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-7 w-full items-center justify-center rounded-full border border-solid border-black/[.15] px-2 text-[10px] font-medium text-zinc-600 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-400 dark:hover:bg-[#1a1a1a]"
        >
          {uploading ? "Uploading…" : "Library"}
        </button>
      </div>
      {(error || cameraError) && (
        <p className="max-w-24 text-center text-[10px] text-red-600">{error ?? cameraError}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        className="hidden"
      />

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative aspect-[4/3] w-full max-w-sm overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-3">
              <button
                type="button"
                onClick={handleCapture}
                className="rounded-full bg-white px-5 py-2 text-sm font-medium text-black"
              >
                Capture
              </button>
              <button
                type="button"
                onClick={closeCamera}
                className="rounded-full bg-black/60 px-5 py-2 text-sm font-medium text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
