import {
  GoogleGenAI,
  Type,
  createPartFromBase64,
  createUserContent,
  type Schema,
} from "@google/genai";

const MODEL = "gemini-2.5-flash";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return new GoogleGenAI({ apiKey });
}

export type ImageInput = { buffer: Buffer; mimeType: string };

function imageParts(front: ImageInput, back: ImageInput) {
  return [
    "Front photo of the slot:",
    createPartFromBase64(front.buffer.toString("base64"), front.mimeType),
    "Back photo of the same slot:",
    createPartFromBase64(back.buffer.toString("base64"), back.mimeType),
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

export type IdentifyKnifeResult =
  | { knifePresent: false; presenceReason: string }
  | {
      knifePresent: true;
      presenceReason: string;
      transcription: string;
      identification: KnifeIdentification;
    };

async function generateJson<T>(
  ai: GoogleGenAI,
  parts: (string | ReturnType<typeof createPartFromBase64>)[],
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

// Three-stage pipeline for a single knife slot:
//   1. Presence check — is a knife even here? Short-circuits on empty slots.
//   2. Transcription — literal reading of visible text/marks, no interpretation.
//   3. Identification — uses the images + transcription to fill in fields,
//      each with a high/medium/low confidence where applicable.
export async function identifyKnife(
  front: ImageInput,
  back: ImageInput,
): Promise<IdentifyKnifeResult> {
  const ai = getClient();

  const presence = await generateJson<{ knife_present: boolean; reason: string }>(
    ai,
    [
      "You are looking at one slot from a flat-lay photo of up to five pocketknives, laid out side by side and photographed from directly above. This is a single cropped vertical slice from that photo, showing the front and back of whatever is in this slot.",
      ...imageParts(front, back),
      "Is a single physical knife clearly present and visible in this slot? Answer false for an empty/background slot, a non-knife object, or an image too unclear to tell.",
    ],
    PRESENCE_SCHEMA,
  );

  if (!presence.knife_present) {
    return { knifePresent: false, presenceReason: presence.reason };
  }

  const { transcription } = await generateJson<{ transcription: string }>(
    ai,
    [
      "This is the front and back photo of a single knife.",
      ...imageParts(front, back),
      "Transcribe exactly what text, numbers, marks, stamps, or engravings you can see on this knife (e.g. tang stamps, handle markings, bolster marks). Report only what is literally visible — do not interpret, identify, or guess what any of it means. If nothing is legible, say so explicitly.",
    ],
    TRANSCRIPTION_SCHEMA,
  );

  const identification = await generateJson<KnifeIdentification>(
    ai,
    [
      "This is the front and back photo of a single pocketknife, along with a literal transcription of the text/marks visible on it.",
      ...imageParts(front, back),
      `Transcription of visible marks:\n${transcription}`,
      "Using both the images and the transcription, identify this knife. For maker, model, blade_steel, and handle_material, also give a confidence level (high/medium/low) for how sure you are. Estimate blade_length_in and overall_length_open_in in inches by comparing the knife's proportions to typical pocketknife dimensions. Use null for anything you cannot determine — do not guess just to fill a field.",
    ],
    IDENTIFICATION_SCHEMA,
  );

  return {
    knifePresent: true,
    presenceReason: presence.reason,
    transcription,
    identification,
  };
}
