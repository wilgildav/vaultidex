import { SLOT_COUNT } from "./constants";

// Splits an image into SLOT_COUNT equal-width, full-height vertical
// strips — the same grid the SlotGuideOverlay draws during capture, so
// slot N of the crop always matches slot N of the on-screen guide.
export async function cropIntoSlots(file: File): Promise<Blob[]> {
  const bitmap = await createImageBitmap(file);
  const slotWidth = bitmap.width / SLOT_COUNT;

  try {
    const blobs: Blob[] = [];

    for (let i = 0; i < SLOT_COUNT; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(slotWidth);
      canvas.height = bitmap.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas is not supported in this browser.");
      }

      ctx.drawImage(
        bitmap,
        i * slotWidth,
        0,
        slotWidth,
        bitmap.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) {
        throw new Error(`Failed to crop slot ${i + 1}.`);
      }
      blobs.push(blob);
    }

    return blobs;
  } finally {
    bitmap.close();
  }
}
