"use client";

import { useRef, useState } from "react";

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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

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

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`flex flex-col items-center justify-center rounded border-2 border-dashed border-black/[.15] text-xs font-medium text-zinc-500 transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-400 dark:hover:bg-[#1a1a1a] ${sizeClassName}`}
      >
        {uploading ? "Uploading…" : "+ Add photo"}
      </button>
      {error && <p className="max-w-24 text-center text-[10px] text-red-600">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}
