import { ApiError, GoogleGenAI } from "@google/genai";

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return new GoogleGenAI({ apiKey });
}

// 503 (model temporarily overloaded) and 429 (rate limited) are both
// transient — Gemini's own guidance is "spikes in demand are usually
// temporary, try again later" — so a short retry absorbs most of them
// instead of surfacing a failure for something that would have succeeded
// a second later.
const RETRYABLE_STATUS_CODES = [429, 503];

export async function withGeminiRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof ApiError && RETRYABLE_STATUS_CODES.includes(err.status);
      if (!retryable || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  // Unreachable — the loop above always either returns or throws.
  throw new Error("withGeminiRetry: exhausted attempts without a result.");
}
