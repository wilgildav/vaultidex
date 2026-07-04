import { ApiError, GoogleGenAI } from "@google/genai";

// Without this, a single Gemini call has no ceiling — under real
// congestion a request can sit for minutes before the server finally
// responds with a 503, and withGeminiRetry would then do that up to
// maxAttempts times per pipeline step. Capping each individual attempt
// means a stuck request fails fast enough to actually retry within a
// reasonable total wait, instead of one hung attempt eating the whole
// budget.
//
// 20s was tried first and was too aggressive: a real multi-image call
// (two full-resolution photos plus the presence+locate reasoning) can
// legitimately take 25-40s with nothing wrong at all, so that value was
// aborting healthy requests, not just hung ones. 45s was still too tight —
// real-world testing measured a single healthy call at ~44s, leaving
// almost no margin, and a same-day comparison test saw individual calls
// legitimately run 45-90s+ under current Gemini load. 90s gives real
// headroom above that baseline while still cutting off true multi-minute
// hangs.
const REQUEST_TIMEOUT_MS = 90_000;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });
}

// 503 (model temporarily overloaded) and 429 (rate limited) are both
// transient — Gemini's own guidance is "spikes in demand are usually
// temporary, try again later" — so a short retry absorbs most of them
// instead of surfacing a failure for something that would have succeeded
// a second later. A client-side timeout (the request hanging past
// REQUEST_TIMEOUT_MS above) is treated the same way — it's the same
// "server is overloaded" situation, just observed as a hang instead of an
// explicit error response, and the SDK surfaces it as a plain AbortError
// rather than an ApiError.
const RETRYABLE_STATUS_CODES = [429, 503];

function isRetryable(err: unknown): boolean {
  if (err instanceof ApiError) return RETRYABLE_STATUS_CODES.includes(err.status);
  return err instanceof Error && err.name === "AbortError";
}

export async function withGeminiRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  // Unreachable — the loop above always either returns or throws.
  throw new Error("withGeminiRetry: exhausted attempts without a result.");
}
