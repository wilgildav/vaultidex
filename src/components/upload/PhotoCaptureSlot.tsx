"use client";

import { useEffect, useMemo, useRef } from "react";
import SlotGuideOverlay from "./SlotGuideOverlay";
import { useCameraCapture } from "@/components/camera/useCameraCapture";

type Props = {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  mode?: "batch" | "single";
};

export default function PhotoCaptureSlot({ label, file, onChange, mode = "batch" }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { videoRef, cameraOpen, cameraError, openCamera, closeCamera, capturePhoto } =
    useCameraCapture();

  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleCapture() {
    const fileName = `${label.toLowerCase().replace(/\s+/g, "-")}.jpg`;
    const captured = await capturePhoto(fileName);
    if (captured) onChange(captured);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.files?.[0] ?? null);
    e.target.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-black dark:text-zinc-50">
          {label}
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {mode === "single"
            ? "Center your knife within the frame guide."
            : "Line up your knives against the numbered guides. Fewer than 5 is completely fine — the guide just shows the maximum."}
        </p>
      </div>

      {cameraOpen ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          <SlotGuideOverlay
            tip="Hold your phone level and at a consistent height"
            mode={mode}
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
      ) : previewUrl ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a static asset */}
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="h-full w-full object-cover"
          />
          <SlotGuideOverlay mode={mode} />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-3 top-3 rounded-full bg-black/60 px-4 py-1.5 text-sm font-medium text-white"
          >
            Retake
          </button>
        </div>
      ) : (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-black/[.15] bg-zinc-50 dark:border-white/[.15] dark:bg-zinc-950">
          <button
            type="button"
            onClick={openCamera}
            className="flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Open Camera
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-11 items-center justify-center rounded-full border border-solid border-black/[.15] px-5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-[#1a1a1a]"
          >
            Choose from Library
          </button>
          {cameraError && (
            <p className="max-w-[220px] text-center text-xs text-red-600">
              {cameraError}
            </p>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        className="hidden"
      />
    </div>
  );
}
