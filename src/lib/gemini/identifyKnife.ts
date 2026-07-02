import {
  GoogleGenAI,
  Type,
  PartMediaResolutionLevel,
  createPartFromBase64,
  createUserContent,
  type Schema,
} from "@google/genai";
import type { ImageInput, SlotImageSet } from "./multiCrop";

const MODEL = "gemini-2.5-flash";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return new GoogleGenAI({ apiKey });
}

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

const GRID_LABELS = [
  "top-left",
  "top-right",
  "middle-left",
  "middle-right",
  "bottom-left",
  "bottom-right",
];

// Labels every crop we have for one side (front/back) so Gemini can
// cross-reference the wide view against the zoomed-in ones instead of
// treating 8 images as unrelated inputs.
function multiCropParts(side: "FRONT" | "BACK", set: SlotImageSet) {
  const parts: (string | ReturnType<typeof imagePart>)[] = [
    `${side} — full slot view:`,
    imagePart(set.fullCrop),
    `${side} — likely stamp-zone close-up (a guess at where a marking usually sits; may not contain it):`,
    imagePart(set.stampZone),
  ];
  set.gridTiles.forEach((tile, i) => {
    parts.push(
      `${side} — grid tile ${i + 1} of ${set.gridTiles.length} (${GRID_LABELS[i] ?? i} region):`,
      imagePart(tile),
    );
  });
  return parts;
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
    pattern: {
      type: Type.STRING,
      nullable: true,
      description:
        "Blade/handle pattern name (e.g. 'Trapper', 'Stockman'), or null if unknown.",
    },
    blade_steel: { type: Type.STRING, nullable: true },
    blade_steel_confidence: { ...CONFIDENCE_SCHEMA, nullable: true },
    handle_material: { type: Type.STRING, nullable: true },
    handle_material_confidence: { ...CONFIDENCE_SCHEMA, nullable: true },
    era: {
      type: Type.STRING,
      nullable: true,
      description: "Estimated production era or year range, or null if unknown.",
    },
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
    "pattern",
    "blade_steel",
    "blade_steel_confidence",
    "handle_material",
    "handle_material_confidence",
    "era",
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
  pattern: string | null;
  blade_steel: string | null;
  blade_steel_confidence: ConfidenceLevel;
  handle_material: string | null;
  handle_material_confidence: ConfidenceLevel;
  era: string | null;
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
      identification: KnifeIdentification;
      consistencyCheck: ConsistencyCheck;
    };

async function generateJson<T>(
  ai: GoogleGenAI,
  parts: (string | ReturnType<typeof imagePart>)[],
  schema: Schema,
): Promise<T> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: createUserContent(parts),
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }
  return JSON.parse(text) as T;
}

const TRANSCRIPTION_PROMPT =
  "Transcribe exactly what text, numbers, marks, stamps, or engravings you can see on this knife. " +
  "You're given a full view of the slot plus several zoomed-in close-ups (a likely stamp-zone guess " +
  "and an overlapping grid of tiles covering the whole slot) — use the close-ups to read fine detail, " +
  "and the full view for context on where things are. Only transcribe characters you can read with " +
  "genuine confidence. If a character or word is blurry, ambiguous, or only partially visible, write " +
  "'[unclear]' for that portion instead of guessing. Do not complete a partial mark into a plausible-" +
  "sounding brand, maker, or model name unless every character is clearly legible — a well-known knife " +
  "brand is not more likely to be correct just because it's familiar. It is far better to report a mark " +
  "as illegible than to guess incorrectly. If nothing is legible at all, say so explicitly.";

async function runTranscription(
  ai: GoogleGenAI,
  front: SlotImageSet,
  back: SlotImageSet,
): Promise<string> {
  const { transcription } = await generateJson<{ transcription: string }>(
    ai,
    [
      "This is one knife, shown from multiple angles and zoom levels.",
      ...multiCropParts("FRONT", front),
      ...multiCropParts("BACK", back),
      TRANSCRIPTION_PROMPT,
    ],
    TRANSCRIPTION_SCHEMA,
  );
  return transcription;
}

// Three-stage pipeline for a single knife slot, plus an optional fourth
// stage for borderline results:
//   1. Presence check — is a knife even here? Short-circuits on empty slots.
//   2. Transcription — literal reading of visible text/marks, using both a
//      full view and multiple zoomed-in crops so small stamps have a
//      chance of appearing at high effective resolution somewhere.
//   3. Identification — uses the images + transcription to fill in fields,
//      each with a high/medium/low confidence where applicable.
//   4. Self-consistency check (only if maker/model confidence came back
//      "medium") — re-run transcription twice more and see if independent
//      attempts agree; agreement upgrades to high confidence, disagreement
//      downgrades to low confidence and records the differing readings.
export async function identifyKnife(
  front: SlotImageSet,
  back: SlotImageSet,
): Promise<IdentifyKnifeResult> {
  const ai = getClient();

  const presence = await generateJson<{ knife_present: boolean; reason: string }>(
    ai,
    [
      "You are looking at one slot from a flat-lay photo of up to five pocketknives, laid out side by side and photographed from directly above. This is a single cropped vertical slice from that photo, showing the front and back of whatever is in this slot.",
      ...imageParts(front.fullCrop, back.fullCrop),
      "Is a single physical knife clearly present and visible in this slot? Answer false for an empty/background slot, a non-knife object, or an image too unclear to tell.",
    ],
    PRESENCE_SCHEMA,
  );

  if (!presence.knife_present) {
    return { knifePresent: false, presenceReason: presence.reason };
  }

  const transcription = await runTranscription(ai, front, back);

  const identification = await generateJson<KnifeIdentification>(
    ai,
    [
      "This is the front and back photo of a single pocketknife, along with a literal transcription of the text/marks visible on it.",
      ...imageParts(front.fullCrop, back.fullCrop),
      `Transcription of visible marks:\n${transcription}`,
      "Using both the images and the transcription, identify this knife. For maker, model, blade_steel, and handle_material, also give a confidence level (high/medium/low) for how sure you are. Estimate blade_length_in and overall_length_open_in in inches by comparing the knife's proportions to typical pocketknife dimensions. Use null for anything you cannot determine — do not guess just to fill a field.",
    ],
    IDENTIFICATION_SCHEMA,
  );

  const needsConsistencyCheck =
    identification.maker_confidence === "medium" || identification.model_confidence === "medium";

  if (!needsConsistencyCheck) {
    return {
      knifePresent: true,
      presenceReason: presence.reason,
      transcription,
      identification,
      consistencyCheck: { ran: false },
    };
  }

  const [transcription2, transcription3] = await Promise.all([
    runTranscription(ai, front, back),
    runTranscription(ai, front, back),
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

  const adjusted: KnifeIdentification = { ...identification };
  if (identification.maker_confidence === "medium") {
    adjusted.maker_confidence = consistency.agree ? "high" : "low";
  }
  if (identification.model_confidence === "medium") {
    adjusted.model_confidence = consistency.agree ? "high" : "low";
  }
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
    identification: adjusted,
    consistencyCheck: { ran: true, agreed: consistency.agree, transcriptions },
  };
}
