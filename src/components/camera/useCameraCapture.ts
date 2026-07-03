"use client";

import { useEffect, useRef, useState } from "react";

// Shared getUserMedia lifecycle for every live-camera capture surface in the
// app (the 5-slot upload guide and the single free-form "add a photo"
// button) — one place for the permission request, resolution constraints,
// and fallback error message, so they can't drift out of sync.
export function useCameraCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Attach the stream once the <video> element has actually mounted, rather
  // than guessing with requestAnimationFrame — on slower devices the old
  // approach could race the DOM commit and leave the viewfinder blank.
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOpen]);

  async function openCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          // Without explicit constraints, browsers often default to a low
          // resolution (observed ~480x640) — nowhere near what phone
          // cameras can do, and far too soft for reading tang stamps.
          // "ideal" degrades gracefully instead of failing on older
          // devices.
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setCameraError("Camera unavailable — use file upload instead.");
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  function capturePhoto(fileName: string): Promise<File | null> {
    return new Promise((resolve) => {
      const video = videoRef.current;
      if (!video) {
        resolve(null);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          closeCamera();
          resolve(blob ? new File([blob], fileName, { type: "image/jpeg" }) : null);
        },
        "image/jpeg",
        0.92,
      );
    });
  }

  return { videoRef, cameraOpen, cameraError, openCamera, closeCamera, capturePhoto };
}
