import sharp, { type Sharp } from "sharp";

export type ImageInput = { buffer: Buffer; mimeType: string };

export type PreparedImage = { image: Sharp; width: number; height: number };

export type MarkLocation = { x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type Region = { left: number; top: number; width: number; height: number };

async function extractJpeg(base: Sharp, region: Region): Promise<ImageInput> {
  const buffer = await base.clone().extract(region).jpeg({ quality: 95 }).toBuffer();
  return { buffer, mimeType: "image/jpeg" };
}

// Decodes an image once and auto-applies EXIF orientation (relevant for
// photos picked from the library rather than captured in-app), so every
// crop taken from it afterward is computed against the image as it
// actually displays, not its raw sensor orientation.
export async function prepareImage(buffer: Buffer): Promise<PreparedImage> {
  const image = sharp(buffer).rotate();
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) {
    throw new Error("Could not read image dimensions.");
  }
  return { image, width, height };
}

// For a user-added extra photo (e.g. a close-up of a tang stamp) — these
// aren't a slice of a multi-knife flat-lay, just a standalone shot, so
// there's no slot geometry to crop against. Still worth normalizing
// through sharp for the same EXIF-orientation fix `prepareImage` does,
// since a photo picked from the library (rather than captured in-app) may
// carry orientation metadata Gemini won't otherwise account for.
export async function normalizeStandaloneImage(buffer: Buffer): Promise<ImageInput> {
  const jpeg = await sharp(buffer).rotate().jpeg({ quality: 95 }).toBuffer();
  return { buffer: jpeg, mimeType: "image/jpeg" };
}

function slotBounds(prepared: PreparedImage, slotPosition: number, slotCount: number): Region {
  const slotWidthExact = prepared.width / slotCount;
  const left = clamp(Math.round((slotPosition - 1) * slotWidthExact), 0, prepared.width - 1);
  const width = clamp(Math.round(slotWidthExact), 1, prepared.width - left);
  return { left, top: 0, width, height: prepared.height };
}

// The whole-knife view for one slot, sourced from the original
// full-resolution batch photo rather than the already-cropped,
// already-recompressed per-slot image saved at upload time. slotCount is
// the batch's actual slot count (1 for single-knife mode, up to 5 for a
// flat-lay batch) — not always 5, so a single-knife photo isn't sliced
// down to its leftmost fifth.
export async function extractSlotFullCrop(
  prepared: PreparedImage,
  slotPosition: number,
  slotCount: number,
): Promise<ImageInput> {
  return extractJpeg(prepared.image, slotBounds(prepared, slotPosition, slotCount));
}

// A tight, upscaled crop around a specific point Gemini reported seeing a
// marking at (fractional x/y within the slot), so small dense text gets
// dedicated pixels instead of being diluted across the whole knife photo.
// The window size is generous since we only have a center point, not a
// bounding box.
export async function extractMarkCrop(
  prepared: PreparedImage,
  slotPosition: number,
  mark: MarkLocation,
  slotCount: number,
): Promise<ImageInput> {
  const slot = slotBounds(prepared, slotPosition, slotCount);
  const cropWidth = clamp(Math.round(slot.width * 0.7), 1, slot.width);
  const cropHeight = clamp(Math.round(prepared.height * 0.15), 1, prepared.height);

  const centerX = slot.left + clamp(mark.x, 0, 1) * slot.width;
  const centerY = clamp(mark.y, 0, 1) * prepared.height;

  const left = clamp(
    Math.round(centerX - cropWidth / 2),
    slot.left,
    slot.left + slot.width - cropWidth,
  );
  const top = clamp(Math.round(centerY - cropHeight / 2), 0, prepared.height - cropHeight);

  const buffer = await prepared.image
    .clone()
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize({ width: cropWidth * 3 })
    .jpeg({ quality: 95 })
    .toBuffer();
  return { buffer, mimeType: "image/jpeg" };
}
