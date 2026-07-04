import {
  GoogleGenAI,
  Type,
  PartMediaResolutionLevel,
  createPartFromBase64,
  createUserContent,
  type Schema,
} from "@google/genai";
import { getGeminiClient, withGeminiRetry } from "./client";
import {
  prepareImage,
  extractSlotFullCrop,
  extractMarkCrop,
  normalizeStandaloneImage,
  type ImageInput,
  type MarkLocation,
} from "./multiCrop";

const MODEL = "gemini-2.5-flash";
const MAX_MARKS_PER_SIDE = 3;

function imagePart(image: ImageInput) {
  return createPartFromBase64(
    image.buffer.toString("base64"),
    image.mimeType,
    PartMediaResolutionLevel.MEDIA_RESOLUTION_HIGH,
  );
}

function imageParts(front: ImageInput, back: ImageInput, extras: ImageInput[] = []) {
  const parts: (string | ReturnType<typeof imagePart>)[] = [
    "Front photo of the slot:",
    imagePart(front),
    "Back photo of the same slot:",
    imagePart(back),
  ];
  extras.forEach((extra, i) => {
    parts.push(
      `Additional user-provided close-up ${i + 1} of ${extras.length} (not tied to front or back specifically — could show either side, or just a detail like a tang stamp):`,
      imagePart(extra),
    );
  });
  return parts;
}

const CONFIDENCE_SCHEMA: Schema = {
  type: Type.STRING,
  format: "enum",
  enum: ["high", "medium", "low"],
};

const MARK_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    x: {
      type: Type.NUMBER,
      minimum: 0,
      maximum: 1,
      description: "Horizontal center of the mark, as a fraction of image width (0=left, 1=right).",
    },
    y: {
      type: Type.NUMBER,
      minimum: 0,
      maximum: 1,
      description: "Vertical center of the mark, as a fraction of image height (0=top, 1=bottom).",
    },
    description: {
      type: Type.STRING,
      description: "Brief description, e.g. 'small printed text block' or 'embossed word'.",
    },
  },
  required: ["x", "y", "description"],
};

// Presence and locate used to be two separate calls. They always ran
// concurrently (locate doesn't depend on knowing presence is true) so
// merging them saves a full API call rather than any wall-clock time —
// but that's still worth it: every call is a chance to hit Gemini's rate
// limiter, so fewer calls per identify() means less exposure to 429/503
// congestion.
const PRESENCE_AND_LOCATE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    knife_present: {
      type: Type.BOOLEAN,
      description:
        "True only if a single physical knife of any kind — folding, fixed-blade, multi-tool, or otherwise — is clearly visible and identifiable in this slot.",
    },
    reason: {
      type: Type.STRING,
      description: "One short sentence explaining the presence determination.",
    },
    front_marks: {
      type: Type.ARRAY,
      items: MARK_SCHEMA,
      maxItems: String(MAX_MARKS_PER_SIDE),
      description:
        "Up to 3 distinct locations on the FRONT image with visible text, numbers, stamps, engravings, or printed markings. Empty array if none, or if no knife is present.",
    },
    back_marks: {
      type: Type.ARRAY,
      items: MARK_SCHEMA,
      maxItems: String(MAX_MARKS_PER_SIDE),
      description: "Same, for the BACK image.",
    },
  },
  required: ["knife_present", "reason", "front_marks", "back_marks"],
};

const TRANSCRIPTION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    transcription: {
      type: Type.STRING,
      description:
        "Exact transcription of every piece of text, numbers, marks, stamps, or engravings visible on the knife, with rough location (e.g. 'tang stamp', 'handle scale'). No interpretation of what they mean. Say so explicitly if nothing is legible.",
    },
  },
  required: ["transcription"],
};

const IDENTIFICATION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    maker: {
      type: Type.STRING,
      nullable: true,
      description: "Manufacturer name, or null if unknown.",
    },
    maker_confidence: { ...CONFIDENCE_SCHEMA, nullable: true },
    model: {
      type: Type.STRING,
      nullable: true,
      description: "Model name, or null if unknown.",
    },
    model_confidence: { ...CONFIDENCE_SCHEMA, nullable: true },
    model_number: {
      type: Type.STRING,
      nullable: true,
      description:
        "Manufacturer's model/pattern number as stamped or printed (e.g. '6318', 'M6'), distinct from the descriptive model name, or null if unknown.",
    },
    model_number_confidence: { ...CONFIDENCE_SCHEMA, nullable: true },
    blade_steel: { type: Type.STRING, nullable: true },
    blade_steel_confidence: { ...CONFIDENCE_SCHEMA, nullable: true },
    handle_material: { type: Type.STRING, nullable: true },
    handle_material_confidence: { ...CONFIDENCE_SCHEMA, nullable: true },
    year_start: {
      type: Type.INTEGER,
      nullable: true,
      description:
        "Estimated earliest possible production year, or null if unknown.",
    },
    year_end: {
      type: Type.INTEGER,
      nullable: true,
      description:
        "Estimated latest possible production year — the same value as year_start if a single year is the best estimate, or null if unknown.",
    },
    year_confidence: { ...CONFIDENCE_SCHEMA, nullable: true },
    blade_length_in: {
      type: Type.NUMBER,
      nullable: true,
      description: "Estimated blade length in inches, or null if it can't be estimated.",
    },
    overall_length_open_in: {
      type: Type.NUMBER,
      nullable: true,
      description:
        "Estimated overall open length in inches, or null if it can't be estimated.",
    },
    notes: {
      type: Type.STRING,
      nullable: true,
      description: "Any short additional context or caveats worth recording, or null.",
    },
  },
  required: [
    "maker",
    "maker_confidence",
    "model",
    "model_confidence",
    "model_number",
    "model_number_confidence",
    "blade_steel",
    "blade_steel_confidence",
    "handle_material",
    "handle_material_confidence",
    "year_start",
    "year_end",
    "year_confidence",
    "blade_length_in",
    "overall_length_open_in",
    "notes",
  ],
};

const CONSISTENCY_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    agree: {
      type: Type.BOOLEAN,
      description:
        "True only if all attempts name the same maker/brand and the same model name or number (minor formatting or spelling variation is fine). False if they name different or conflicting makers/models, or if some say illegible and others name something.",
    },
    summary: {
      type: Type.STRING,
      description: "One short sentence explaining the agreement or disagreement.",
    },
  },
  required: ["agree", "summary"],
};

export type ConfidenceLevel = "high" | "medium" | "low" | null;

export type KnifeIdentification = {
  maker: string | null;
  maker_confidence: ConfidenceLevel;
  model: string | null;
  model_confidence: ConfidenceLevel;
  model_number: string | null;
  model_number_confidence: ConfidenceLevel;
  blade_steel: string | null;
  blade_steel_confidence: ConfidenceLevel;
  handle_material: string | null;
  handle_material_confidence: ConfidenceLevel;
  year_start: number | null;
  year_end: number | null;
  year_confidence: ConfidenceLevel;
  blade_length_in: number | null;
  overall_length_open_in: number | null;
  notes: string | null;
};

export type ConsistencyCheck = {
  ran: boolean;
  agreed?: boolean;
  transcriptions?: string[];
};

export type IdentifyKnifeResult =
  | { knifePresent: false; presenceReason: string }
  | {
      knifePresent: true;
      presenceReason: string;
      transcription: string;
      locatedMarks: { front: number; back: number };
      identification: KnifeIdentification;
      consistencyCheck: ConsistencyCheck;
    };

// Per-step timing, logged to the server console — added while diagnosing
// where "identification didn't finish" time actually goes. Cheap enough to
// leave in permanently: one console.log per pipeline stage, not per
// request internals.
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[identifyKnife] ${label}: ${((Date.now() - start) / 1000).toFixed(1)}s`);
  }
}

async function generateJson<T>(
  ai: GoogleGenAI,
  parts: (string | ReturnType<typeof imagePart>)[],
  schema: Schema,
): Promise<T> {
  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: createUserContent(parts),
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    }),
  );

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }
  return JSON.parse(text) as T;
}

// Describes the actual photo geometry (a batch flat-lay with multiple
// slots vs. a single centered shot) rather than always assuming a batch of
// pocketknives — a hardcoded "up to five pocketknives" description was
// both inaccurate for single-knife uploads and nudged the model toward
// expecting a folding knife regardless of what's actually in the photo.
//
// Asks two things in one call: is a knife present, and (regardless of
// that answer) where are the marks worth zooming into. The second
// question costs nothing extra when the first is false — the caller just
// discards the mark locations in that case.
function presenceAndLocatePrompt(slotCount: number): string {
  const setup =
    slotCount > 1
      ? `You are looking at one slot from a flat-lay photo of up to ${slotCount} knives, laid out ` +
        "side by side and photographed from directly above. This is a single cropped vertical " +
        "slice from that photo, showing the front and back of whatever is in this slot."
      : "You are looking at a flat-lay photo of a single knife, photographed from directly above, " +
        "showing its front and back.";
  return (
    `${setup} First, determine whether a single physical knife of any kind — folding, ` +
    "fixed-blade, multi-tool, or otherwise — is clearly present and visible. Answer false for " +
    "an empty/background slot, a non-knife object, or an image too unclear to tell. Second, " +
    "whether or not a knife is present, identify up to 3 distinct areas on each side (front and " +
    "back) where you can see any text, numbers, stamps, engravings, or printed markings — even " +
    "if you can't read them clearly yet, just note where they are; use an empty list for a side " +
    "with none, or if no knife is present. For each, report its approximate center position as " +
    "a fraction of that image's width (x: 0=left, 1=right) and height (y: 0=top, 1=bottom)."
  );
}

const TRANSCRIPTION_PROMPT =
  "Transcribe exactly what text, numbers, marks, stamps, or engravings you can see on this " +
  "knife. You're given a full view of the slot plus zoomed-in close-ups of specific areas " +
  "already identified as likely containing markings — use the close-ups to read fine detail, " +
  "and the full view for context on where things are. Only transcribe characters you can read " +
  "with genuine confidence. If a character or word is blurry, ambiguous, or only partially " +
  "visible, write '[unclear]' for that portion instead of guessing. Do not complete a partial " +
  "mark into a plausible-sounding brand, maker, or model name unless every character is " +
  "clearly legible — a well-known brand is not more likely to be correct just because it's " +
  "familiar. It is far better to report a mark as illegible than to guess incorrectly. If " +
  "nothing is legible at all, say so explicitly.";

async function runTranscription(
  ai: GoogleGenAI,
  frontFull: ImageInput,
  backFull: ImageInput,
  frontMarkCrops: ImageInput[],
  backMarkCrops: ImageInput[],
  extras: ImageInput[] = [],
): Promise<string> {
  const parts: (string | ReturnType<typeof imagePart>)[] = [
    "This is one knife, shown from multiple angles and zoom levels.",
    "FRONT — full slot view:",
    imagePart(frontFull),
  ];
  frontMarkCrops.forEach((crop, i) => {
    parts.push(
      `FRONT — zoomed close-up ${i + 1} of ${frontMarkCrops.length} (a located area of interest):`,
      imagePart(crop),
    );
  });
  parts.push("BACK — full slot view:", imagePart(backFull));
  backMarkCrops.forEach((crop, i) => {
    parts.push(
      `BACK — zoomed close-up ${i + 1} of ${backMarkCrops.length} (a located area of interest):`,
      imagePart(crop),
    );
  });
  extras.forEach((extra, i) => {
    parts.push(
      `ADDITIONAL — user-provided close-up ${i + 1} of ${extras.length} (not tied to front or back specifically):`,
      imagePart(extra),
    );
  });
  parts.push(TRANSCRIPTION_PROMPT);

  const { transcription } = await generateJson<{ transcription: string }>(
    ai,
    parts,
    TRANSCRIPTION_SCHEMA,
  );
  return transcription;
}

// Pipeline for a single knife slot. Fact verification (a grounded web
// search) is deliberately NOT part of this function — it's the slowest
// single step (real web search + synthesis, not just token generation),
// so it runs as a separate follow-up call (see verifySpecs.ts and the
// /verify-specs route) once this returns, instead of making the caller
// wait for it before seeing any result.
//
//   1. Presence + locate — one call asking both "is a knife here" and
//      "where are the marks worth zooming into". If presence comes back
//      false, the mark locations are just discarded.
//   2. Zoom — crop tightly around each located point, from the original
//      full-resolution photo, so small dense text gets dedicated pixels
//      instead of being diluted across the whole knife.
//   3. Transcription — literal reading, using the full views plus the
//      located zoomed crops.
//   4. Identification — uses the images + transcription to fill in fields,
//      each with a high/medium/low confidence where applicable.
//   5. Self-consistency check (only if maker/model confidence came back
//      "medium") — re-run transcription twice more using the same located
//      crops; agreement upgrades to high confidence, disagreement
//      downgrades to low confidence and records the differing readings.
export async function identifyKnife(
  frontBuffer: Buffer,
  backBuffer: Buffer,
  slotPosition: number,
  slotCount: number,
  extraBuffers: Buffer[] = [],
): Promise<IdentifyKnifeResult> {
  const ai = getGeminiClient();
  const pipelineStart = Date.now();

  const [frontPrepared, backPrepared, extraImages] = await timed("image prep", () =>
    Promise.all([
      prepareImage(frontBuffer),
      prepareImage(backBuffer),
      Promise.all(extraBuffers.map(normalizeStandaloneImage)),
    ]),
  );
  const [frontFull, backFull] = await timed("slot crop", () =>
    Promise.all([
      extractSlotFullCrop(frontPrepared, slotPosition, slotCount),
      extractSlotFullCrop(backPrepared, slotPosition, slotCount),
    ]),
  );

  // Extras ride along here too — they're relevant to the presence
  // determination — even though the resulting mark coordinates only ever
  // get applied to the front/back slot images specifically (an extra
  // photo is already a close-up, so there's nothing in it to crop
  // tighter). The images are each labeled in imageParts, so the model
  // attributes front_marks/back_marks to the right ones regardless.
  const presenceAndLocate = await timed("presence+locate call", () =>
    generateJson<{
      knife_present: boolean;
      reason: string;
      front_marks: MarkLocation[];
      back_marks: MarkLocation[];
    }>(
      ai,
      [...imageParts(frontFull, backFull, extraImages), presenceAndLocatePrompt(slotCount)],
      PRESENCE_AND_LOCATE_SCHEMA,
    ),
  );

  if (!presenceAndLocate.knife_present) {
    console.log(`[identifyKnife] total (not present): ${((Date.now() - pipelineStart) / 1000).toFixed(1)}s`);
    return { knifePresent: false, presenceReason: presenceAndLocate.reason };
  }

  const [frontMarkCrops, backMarkCrops] = await timed("mark crop", () =>
    Promise.all([
      Promise.all(
        presenceAndLocate.front_marks.map((mark) =>
          extractMarkCrop(frontPrepared, slotPosition, mark, slotCount),
        ),
      ),
      Promise.all(
        presenceAndLocate.back_marks.map((mark) =>
          extractMarkCrop(backPrepared, slotPosition, mark, slotCount),
        ),
      ),
    ]),
  );

  const transcription = await timed("transcription call", () =>
    runTranscription(ai, frontFull, backFull, frontMarkCrops, backMarkCrops, extraImages),
  );

  const identification = await timed("identification call", () =>
    generateJson<KnifeIdentification>(
      ai,
      [
        "This is the front and back photo of a single knife, along with a literal transcription of the text/marks visible on it.",
        ...imageParts(frontFull, backFull, extraImages),
        `Transcription of visible marks:\n${transcription}`,
        "Using both the images and the transcription, identify this knife. Model_number is the manufacturer's stamped/printed model or pattern number (e.g. '6318'), distinct from the descriptive model name — leave it null if no such number is visible, don't infer one from the model name. For maker, model, model_number, blade_steel, and handle_material, also give a confidence level (high/medium/low) for how sure you are. Estimate blade_length_in and overall_length_open_in in inches by comparing the knife's proportions to typical dimensions for its apparent type (folding pocketknife, fixed-blade, multi-tool, etc.) — don't assume it's a folding pocketknife unless the images show one. Estimate year_start and year_end (the earliest and latest years this knife was likely produced) by reasoning about the maker/model, construction style, materials, and any markings — use the same value for both if a single year is the best estimate, and give a year_confidence for that estimate. Use null for anything you cannot determine — do not guess just to fill a field.",
      ],
      IDENTIFICATION_SCHEMA,
    ),
  );

  const locatedMarks = { front: frontMarkCrops.length, back: backMarkCrops.length };

  const needsConsistencyCheck =
    identification.maker_confidence === "medium" || identification.model_confidence === "medium";

  if (!needsConsistencyCheck) {
    console.log(`[identifyKnife] total: ${((Date.now() - pipelineStart) / 1000).toFixed(1)}s`);
    return {
      knifePresent: true,
      presenceReason: presenceAndLocate.reason,
      transcription,
      locatedMarks,
      identification,
      consistencyCheck: { ran: false },
    };
  }

  const [transcription2, transcription3] = await timed("self-consistency reruns (x2, parallel)", () =>
    Promise.all([
      runTranscription(ai, frontFull, backFull, frontMarkCrops, backMarkCrops, extraImages),
      runTranscription(ai, frontFull, backFull, frontMarkCrops, backMarkCrops, extraImages),
    ]),
  );
  const transcriptions = [transcription, transcription2, transcription3];

  const consistency = await timed("consistency compare call", () =>
    generateJson<{ agree: boolean; summary: string }>(
      ai,
      [
        "Here are three independent attempts at transcribing the marks on the same knife:",
        `Attempt 1:\n${transcriptions[0]}`,
        `Attempt 2:\n${transcriptions[1]}`,
        `Attempt 3:\n${transcriptions[2]}`,
        "Do these three attempts substantially agree on the same maker/brand name and the same model name or number?",
      ],
      CONSISTENCY_SCHEMA,
    ),
  );

  // The consistency check asks a single joint question — whether maker AND
  // model agree across independent re-reads — so its verdict applies to
  // both fields whenever it runs, not just whichever one was "medium" and
  // triggered it. Otherwise a maker the model was already (over)confident
  // about at "high" never gets corrected even when the re-reads disagree
  // on that exact maker name.
  const adjusted: KnifeIdentification = {
    ...identification,
    maker_confidence: consistency.agree ? "high" : "low",
    model_confidence: consistency.agree ? "high" : "low",
  };
  if (!consistency.agree) {
    const disagreementNote =
      `Self-consistency check disagreed on maker/model (${consistency.summary}). Differing readings:\n` +
      transcriptions.map((t, i) => `${i + 1}) ${t}`).join("\n");
    adjusted.notes = adjusted.notes ? `${adjusted.notes}\n\n${disagreementNote}` : disagreementNote;
  }

  console.log(`[identifyKnife] total (with self-consistency): ${((Date.now() - pipelineStart) / 1000).toFixed(1)}s`);
  return {
    knifePresent: true,
    presenceReason: presenceAndLocate.reason,
    transcription,
    locatedMarks,
    identification: adjusted,
    consistencyCheck: { ran: true, agreed: consistency.agree, transcriptions },
  };
}
