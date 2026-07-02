import sharp, { type Sharp } from "sharp";
import { SLOT_COUNT } from "@/lib/upload/constants";

export type ImageInput = { buffer: Buffer; mimeType: string };

export type SlotImageSet = {
  fullCrop: ImageInput;
  stampZone: ImageInput;
  gridTiles: ImageInput[];
};

// Rough guess at where a ricasso/tang stamp tends to sit when a knife is
// laid out lengthwise within its slot: a band around the vertical middle.
const STAMP_ZONE_HEIGHT_FRACTION = 0.45;

const GRID_COLUMNS = 2;
const GRID_ROWS = 3;
const GRID_OVERLAP = 0.25;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type Region = { left: number; top: number; width: number; height: number };

async function extractJpeg(base: Sharp, region: Region): Promise<ImageInput> {
  const buffer = await base.clone().extract(region).jpeg({ quality: 95 }).toBuffer();
  return { buffer, mimeType: "image/jpeg" };
}

// Builds three kinds of crops for one knife slot, all sourced from the
// original full-resolution batch photo (not the already-cropped, already
// re-compressed per-slot image) so we lose as little detail as possible:
//   - fullCrop: the whole knife, same 1/5-width slice as before.
//   - stampZone: a tighter guess at the likely marking location.
//   - gridTiles: a 2x3 overlapping grid covering the whole slot, so small
//     text has a good chance of landing at high effective resolution in at
//     least one tile without needing to know exactly where it is.
export async function buildSlotImageSet(
  fullImageBuffer: Buffer,
  slotPosition: number,
): Promise<SlotImageSet> {
  // .rotate() with no args auto-applies EXIF orientation (relevant for
  // photos picked from the library rather than captured in-app) so width/
  // height and all extract regions below are computed against the image
  // as it actually displays, not its raw sensor orientation.
  const oriented = sharp(fullImageBuffer).rotate();
  const metadata = await oriented.metadata();
  const fullWidth = metadata.width ?? 0;
  const fullHeight = metadata.height ?? 0;
  if (!fullWidth || !fullHeight) {
    throw new Error("Could not read image dimensions.");
  }

  const slotWidthExact = fullWidth / SLOT_COUNT;
  const slotLeft = clamp(Math.round((slotPosition - 1) * slotWidthExact), 0, fullWidth - 1);
  const slotWidth = clamp(Math.round(slotWidthExact), 1, fullWidth - slotLeft);

  const fullCrop = await extractJpeg(oriented, {
    left: slotLeft,
    top: 0,
    width: slotWidth,
    height: fullHeight,
  });

  const stampZoneHeight = clamp(Math.round(fullHeight * STAMP_ZONE_HEIGHT_FRACTION), 1, fullHeight);
  const stampZoneTop = clamp(Math.round((fullHeight - stampZoneHeight) / 2), 0, fullHeight - stampZoneHeight);
  const stampZone = await extractJpeg(oriented, {
    left: slotLeft,
    top: stampZoneTop,
    width: slotWidth,
    height: stampZoneHeight,
  });

  const baseTileW = slotWidth / GRID_COLUMNS;
  const baseTileH = fullHeight / GRID_ROWS;
  const tileW = clamp(Math.round(baseTileW * (1 + GRID_OVERLAP)), 1, slotWidth);
  const tileH = clamp(Math.round(baseTileH * (1 + GRID_OVERLAP)), 1, fullHeight);

  const gridTiles: ImageInput[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLUMNS; col++) {
      const centerX = slotLeft + (col + 0.5) * baseTileW;
      const centerY = (row + 0.5) * baseTileH;
      const left = clamp(Math.round(centerX - tileW / 2), slotLeft, slotLeft + slotWidth - tileW);
      const top = clamp(Math.round(centerY - tileH / 2), 0, fullHeight - tileH);
      gridTiles.push(await extractJpeg(oriented, { left, top, width: tileW, height: tileH }));
    }
  }

  return { fullCrop, stampZone, gridTiles };
}
