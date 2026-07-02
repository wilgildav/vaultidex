"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SlotGuideOverlay from "./SlotGuideOverlay";

type Props = {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
};

export default function PhotoCaptureSlot({ label, file, onChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function openCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch {
      setCameraError('Camera unavailable — use "Choose from Library" instead.');
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const fileName = `${label.toLowerCase().replace(/\s+/g, "-")}.jpg`;
          onChange(new File([blob], fileName, { type: "image/jpeg" }));
        }
        closeCamera();
      },
      "image/jpeg",
      0.92,
    );
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
          Line up your knives against the numbered guides. Fewer than 5 is
          completely fine — the guide just shows the maximum.
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
          <SlotGuideOverlay />
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-3">
            <button
              type="button"
              onClick={capturePhoto}
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
          <SlotGuideOverlay />
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
