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

function imageParts(front: ImageInput, back: ImageInput) {
  return [
    "Front photo of the slot:",
    imagePart(front),
    "Back photo of the same slot:",
    imagePart(back),
  ];
}

const CONFIDENCE_SCHEMA: Schema = {
  type: Type.STRING,
  format: "enum",
  enum: ["high", "medium", "low"],
};

const PRESENCE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    knife_present: {
      type: Type.BOOLEAN,
      description:
        "True only if a single physical pocketknife or fixed-blade knife is clearly visible and identifiable in this slot.",
    },
    reason: {
      type: Type.STRING,
      description: "One short sentence explaining the determination.",
    },
  },
  required: ["knife_present", "reason"],
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

const LOCATE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    front_marks: {
      type: Type.ARRAY,
      items: MARK_SCHEMA,
      maxItems: String(MAX_MARKS_PER_SIDE),
      description:
        "Up to 3 distinct locations on the FRONT image with visible text, numbers, stamps, engravings, or printed markings. Empty array if none.",
    },
    back_marks: {
      type: Type.ARRAY,
      items: MARK_SCHEMA,
      maxItems: String(MAX_MARKS_PER_SIDE),
      description: "Same, for the BACK image.",
    },
  },
  required: ["front_marks", "back_marks"],
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

const PRESENCE_PROMPT =
  "You are looking at one slot from a flat-lay photo of up to five pocketknives, laid out " +
  "side by side and photographed from directly above. This is a single cropped vertical slice " +
  "from that photo, showing the front and back of whatever is in this slot. Is a single " +
  "physical knife clearly present and visible in this slot? Answer false for an " +
  "empty/background slot, a non-knife object, or an image too unclear to tell.";

const LOCATE_PROMPT =
  "Look at the full view of this knife slot (front and back) and identify up to 3 distinct " +
  "areas on each side where you can see any text, numbers, stamps, engravings, or printed " +
  "markings — even if you can't read them clearly yet, just note where they are. For each, " +
  "report its approximate center position as a fraction of that image's width (x: 0=left, " +
  "1=right) and height (y: 0=top, 1=bottom). If a side has no visible marking at all, return " +
  "an empty list for that side.";

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
//   1. Presence check and 2. Locate run in parallel — locate doesn't
//      actually depend on knowing presence is true, so there's no reason
//      to wait for one before starting the other. If presence comes back
//      false, the locate result is just discarded.
//   3. Zoom — crop tightly around each located point, from the original
//      full-resolution photo, so small dense text gets dedicated pixels
//      instead of being diluted across the whole knife.
//   4. Transcription — literal reading, using the full views plus the
//      located zoomed crops.
//   5. Identification — uses the images + transcription to fill in fields,
//      each with a high/medium/low confidence where applicable.
//   6. Self-consistency check (only if maker/model confidence came back
//      "medium") — re-run transcription twice more using the same located
//      crops; agreement upgrades to high confidence, disagreement
//      downgrades to low confidence and records the differing readings.
export async function identifyKnife(
  frontBuffer: Buffer,
  backBuffer: Buffer,
  slotPosition: number,
): Promise<IdentifyKnifeResult> {
  const ai = getGeminiClient();

  const [frontPrepared, backPrepared] = await Promise.all([
    prepareImage(frontBuffer),
    prepareImage(backBuffer),
  ]);
  const [frontFull, backFull] = await Promise.all([
    extractSlotFullCrop(frontPrepared, slotPosition),
    extractSlotFullCrop(backPrepared, slotPosition),
  ]);

  const [presence, located] = await Promise.all([
    generateJson<{ knife_present: boolean; reason: string }>(
      ai,
      [...imageParts(frontFull, backFull), PRESENCE_PROMPT],
      PRESENCE_SCHEMA,
    ),
    generateJson<{ front_marks: MarkLocation[]; back_marks: MarkLocation[] }>(
      ai,
      [...imageParts(frontFull, backFull), LOCATE_PROMPT],
      LOCATE_SCHEMA,
    ),
  ]);

  if (!presence.knife_present) {
    return { knifePresent: false, presenceReason: presence.reason };
  }

  const [frontMarkCrops, backMarkCrops] = await Promise.all([
    Promise.all(
      located.front_marks.map((mark) => extractMarkCrop(frontPrepared, slotPosition, mark)),
    ),
    Promise.all(
      located.back_marks.map((mark) => extractMarkCrop(backPrepared, slotPosition, mark)),
    ),
  ]);

  const transcription = await runTranscription(
    ai,
    frontFull,
    backFull,
    frontMarkCrops,
    backMarkCrops,
  );

  const identification = await generateJson<KnifeIdentification>(
    ai,
    [
      "This is the front and back photo of a single pocketknife, along with a literal transcription of the text/marks visible on it.",
      ...imageParts(frontFull, backFull),
      `Transcription of visible marks:\n${transcription}`,
      "Using both the images and the transcription, identify this knife. Model_number is the manufacturer's stamped/printed model or pattern number (e.g. '6318'), distinct from the descriptive model name — leave it null if no such number is visible, don't infer one from the model name. For maker, model, model_number, blade_steel, and handle_material, also give a confidence level (high/medium/low) for how sure you are. Estimate blade_length_in and overall_length_open_in in inches by comparing the knife's proportions to typical pocketknife dimensions. Estimate year_start and year_end (the earliest and latest years this knife was likely produced) by reasoning about the maker/model, construction style, materials, and any markings — use the same value for both if a single year is the best estimate, and give a year_confidence for that estimate. Use null for anything you cannot determine — do not guess just to fill a field.",
    ],
    IDENTIFICATION_SCHEMA,
  );

  const locatedMarks = { front: frontMarkCrops.length, back: backMarkCrops.length };

  const needsConsistencyCheck =
    identification.maker_confidence === "medium" || identification.model_confidence === "medium";

  if (!needsConsistencyCheck) {
    return {
      knifePresent: true,
      presenceReason: presence.reason,
      transcription,
      locatedMarks,
      identification,
      consistencyCheck: { ran: false },
    };
  }

  const [transcription2, transcription3] = await Promise.all([
    runTranscription(ai, frontFull, backFull, frontMarkCrops, backMarkCrops),
    runTranscription(ai, frontFull, backFull, frontMarkCrops, backMarkCrops),
  ]);
  const transcriptions = [transcription, transcription2, transcription3];

  const consistency = await generateJson<{ agree: boolean; summary: string }>(
    ai,
    [
      "Here are three independent attempts at transcribing the marks on the same knife:",
      `Attempt 1:\n${transcriptions[0]}`,
      `Attempt 2:\n${transcriptions[1]}`,
      `Attempt 3:\n${transcriptions[2]}`,
      "Do these three attempts substantially agree on the same maker/brand name and the same model name or number?",
    ],
    CONSISTENCY_SCHEMA,
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

  return {
    knifePresent: true,
    presenceReason: presence.reason,
    transcription,
    locatedMarks,
    identification: adjusted,
    consistencyCheck: { ran: true, agreed: consistency.agree, transcriptions },
  };
}
