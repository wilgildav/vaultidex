import { GoogleGenAI, Type, createUserContent, type Schema } from "@google/genai";
import { getGeminiClient, withGeminiRetry } from "./client";

const MODEL = "gemini-2.5-flash";

// Per-step timing, logged to the server console — matches the same
// instrumentation added to identifyKnife.ts. Added after a verify-specs
// call failed with no diagnostic trail at all: the route's catch block
// only ever returned the error to the client, so there was no way to
// tell whether a given failure was the (documented-slow) grounded search
// itself timing out vs. something else.
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[verifySpecs] ${label}: ${((Date.now() - start) / 1000).toFixed(1)}s`);
  }
}

export type SpecSource = { title: string; uri: string };

export type VerifiedSpecs = {
  found: boolean;
  blade_length_in_verified: number | null;
  overall_length_open_in_verified: number | null;
  blade_steel_verified: string | null;
  sources: SpecSource[];
  notes: string | null;
};

const EXTRACTION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    found: {
      type: Type.BOOLEAN,
      description:
        "True if the research below identifies this specific maker/model and gives at least one usable spec value for it — even if sources vary slightly (real retailers routinely differ by measurement convention, e.g. cutting edge vs. full blade length, or rounding cm to inches). Pick the manufacturer's own number when cited, otherwise the most commonly repeated value, and note the variance in `notes` rather than treating it as a failure. Only use false if the research found no specific product match at all, or only generic/unrelated information.",
    },
    blade_length_in: {
      type: Type.NUMBER,
      nullable: true,
      description:
        "Best single blade length in inches (manufacturer's figure if available, otherwise the most commonly cited value), or null if truly not stated anywhere.",
    },
    overall_length_open_in: {
      type: Type.NUMBER,
      nullable: true,
      description:
        "Best single overall open length in inches (manufacturer's figure if available, otherwise the most commonly cited value), or null if truly not stated anywhere.",
    },
    blade_steel: {
      type: Type.STRING,
      nullable: true,
      description: "Blade steel type, or null if not clearly stated.",
    },
    notes: {
      type: Type.STRING,
      nullable: true,
      description:
        "One short sentence of caveats worth keeping — e.g. the range across sources if they varied, which source the chosen number came from, or why nothing could be found. Null only if there's nothing worth noting.",
    },
  },
  required: ["found", "blade_length_in", "overall_length_open_in", "blade_steel", "notes"],
};

async function generateJson<T>(ai: GoogleGenAI, parts: string[], schema: Schema): Promise<T> {
  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: createUserContent(parts),
      config: { responseMimeType: "application/json", responseSchema: schema },
    }),
  );
  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }
  return JSON.parse(text) as T;
}

// Grounding (the googleSearch tool) can't be combined with responseSchema
// in the same call, so this is two calls: a grounded free-text search,
// then a plain structured call to extract fields from that text. Only the
// first call is billed as a grounded request.
//
// Deliberately its own function (not folded into identifyKnife) since the
// grounded search is the slowest single step in the whole pipeline — real
// web search and synthesis, not just token generation — so it runs as a
// separate follow-up after the base identification is already shown,
// rather than making the user wait for it before seeing anything.
export async function verifySpecs(maker: string, model: string): Promise<VerifiedSpecs> {
  const ai = getGeminiClient();
  const subject = `maker "${maker}", model "${model}"`;
  const pipelineStart = Date.now();

  const searchResponse = await timed("grounded search call", () =>
    withGeminiRetry(() =>
      ai.models.generateContent({
        model: MODEL,
        contents: createUserContent([
          `Search for the official or widely-cited specifications of this knife: ${subject}. ` +
            "Report the blade length (inches), overall open length when opened (inches), and " +
            "blade steel type, based on real sources such as the manufacturer's website, retailer " +
            "listings, or established knife-enthusiast references. Prefer the manufacturer's own " +
            "listed figures if you find them. Sources routinely differ slightly by measurement " +
            "convention (e.g. cutting edge vs. full blade length, or rounded metric conversions) — " +
            "that's normal, not a failure; state your best single number for each spec and mention " +
            "the range if it's notable. Only say you can't find reliable specs if you genuinely find " +
            "no information tying real numbers to this specific model.",
        ]),
        config: {
          tools: [{ googleSearch: {} }],
        },
      }),
    ),
  );

  const searchText = searchResponse.text ?? "";
  const groundingChunks = searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources: SpecSource[] = groundingChunks
    .map((chunk) => chunk.web)
    .filter((web): web is { uri: string; title?: string } => !!web?.uri)
    .map((web) => ({ uri: web.uri, title: web.title || web.uri }));

  if (!searchText.trim()) {
    console.log(`[verifySpecs] total (no search result): ${((Date.now() - pipelineStart) / 1000).toFixed(1)}s`);
    return {
      found: false,
      blade_length_in_verified: null,
      overall_length_open_in_verified: null,
      blade_steel_verified: null,
      sources: [],
      notes: "Search returned no result.",
    };
  }

  const extracted = await timed("extraction call", () =>
    generateJson<{
      found: boolean;
      blade_length_in: number | null;
      overall_length_open_in: number | null;
      blade_steel: string | null;
      notes: string | null;
    }>(
      ai,
      [
        `Here is researched information about a knife (${subject}):\n${searchText}`,
        "Extract the blade length, overall open length, and blade steel type as structured fields.",
      ],
      EXTRACTION_SCHEMA,
    ),
  );

  console.log(`[verifySpecs] total: ${((Date.now() - pipelineStart) / 1000).toFixed(1)}s`);
  return {
    found: extracted.found,
    blade_length_in_verified: extracted.found ? extracted.blade_length_in : null,
    overall_length_open_in_verified: extracted.found ? extracted.overall_length_open_in : null,
    blade_steel_verified: extracted.found ? extracted.blade_steel : null,
    sources: extracted.found ? sources : [],
    notes: extracted.notes,
  };
}
