/**
 * lib/gemini-vision.ts
 * -----------------------------------------------------------------------------
 * Google Gemini provider for the Plan Analyzer.
 *
 * This exists primarily so students (or anyone without an Anthropic budget)
 * can run the tool entirely on Gemini's free tier. Google publishes a no-cost
 * tier for the Flash / Flash-Lite model family via Google AI Studio
 * (https://aistudio.google.com/apikey) — no credit card required to get a key.
 * Exact free-tier rate limits change over time and are best checked live at
 * https://aistudio.google.com/rate-limit, but Flash-Lite models are
 * consistently the most generous/cheapest tier Google offers.
 *
 * Like lib/claude-vision.ts, this file only handles Gemini-specific API
 * mechanics. The prompt text, extraction schema, and all deterministic
 * post-processing math live in lib/plan-extraction-schema.ts and are shared
 * across providers so results are shaped identically regardless of which one
 * a student picks.
 *
 * SDK: `@google/genai` — the current official Google GenAI SDK for Node/TS
 * (successor to the deprecated `@google/generative-ai` package).
 * -----------------------------------------------------------------------------
 */

import { GoogleGenAI } from "@google/genai";
import type { PlanAnalysisResult } from "./types";
import { getGeminiApiKey, getGeminiModel } from "./ai-settings";
import {
  buildPlanAnalysisResult,
  buildUserPrompt,
  parseJsonFromModelText,
  PLAN_EXTRACTION_JSON_SCHEMA,
  RawExtraction,
  SYSTEM_PROMPT,
  VisionExtractionError,
} from "./plan-extraction-schema";

// -----------------------------------------------------------------------------
// Client setup
// -----------------------------------------------------------------------------

/**
 * Builds a fresh GoogleGenAI client using whatever API key is currently active
 * (in-app Settings panel takes precedence over GEMINI_API_KEY/GOOGLE_API_KEY —
 * see lib/ai-settings.ts). Deliberately NOT cached as a module-level singleton
 * for the same reason as lib/claude-vision.ts's getClient(): the key can
 * change at runtime via the Settings panel.
 */
async function getClient(): Promise<GoogleGenAI> {
  const { value: apiKey } = await getGeminiApiKey();
  if (!apiKey) {
    throw new VisionExtractionError(
      "No Gemini API key configured. Add one in the app's Settings panel, or get a free key at https://aistudio.google.com/apikey and set GEMINI_API_KEY in your environment, before selecting Gemini as the analysis provider."
    );
  }

  return new GoogleGenAI({ apiKey });
}

/** Re-exported for symmetry with lib/claude-vision.ts's ClaudeVisionError alias. */
export const GeminiVisionError = VisionExtractionError;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export interface AnalyzePlanImageWithGeminiInput {
  /** Base64-encoded image bytes (no data: URL prefix). PDFs must be pre-rasterized to an image before calling this. */
  imageBase64: string;
  /** Media type of the base64 image payload. */
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  fileName: string;
  knownScale?: string;
  referenceMeasurementM?: number;
  /** Optional free-text context appended to the model's user prompt. */
  context?: string;
}

/**
 * Sends a floor plan image to Gemini and returns a fully computed
 * PlanAnalysisResult, with all derived measurements calculated deterministically
 * from the model's raw geometry extraction (same post-processing pipeline as
 * the Claude provider).
 */
export async function analyzePlanImageWithGemini(
  input: AnalyzePlanImageWithGeminiInput
): Promise<PlanAnalysisResult> {
  const client = await getClient();
  // getGeminiModel() always resolves to a string (settings → env → built-in
  // default), but its type is string | undefined for symmetry with the API
  // key getters, so we fall back defensively here to keep the SDK call typed.
  const model = (await getGeminiModel()).value ?? "gemini-3.5-flash";

  // Gemini's inline image parts use image/gif support inconsistently across
  // models; we only ever feed it PNG/JPEG/WEBP in practice (PDFs are
  // rasterized to PNG upstream in app/api/analyze/route.ts), so this is safe.
  const mimeType = input.mediaType === "image/gif" ? "image/png" : input.mediaType;

  let rawText: string;
  try {
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: input.imageBase64 } },
            { text: buildUserPrompt(input.fileName, input.knownScale, input.referenceMeasurementM, input.context) },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: PLAN_EXTRACTION_JSON_SCHEMA,
        temperature: 0.2,
      },
    });

    rawText = extractResponseText(response);
  } catch (err) {
    throw new VisionExtractionError(
      `Gemini API request failed: ${err instanceof Error ? err.message : String(err)}. ` +
        `If this mentions quota or rate limits, the free tier may be temporarily exhausted — check https://aistudio.google.com/rate-limit or try again shortly.`,
      err
    );
  }

  if (!rawText || !rawText.trim()) {
    throw new VisionExtractionError(
      "Gemini returned an empty response. The model may have refused, or the image may be unreadable. Try a clearer image or switch providers."
    );
  }

  let raw: RawExtraction;
  try {
    raw = parseJsonFromModelText(rawText) as RawExtraction;
  } catch (err) {
    throw new VisionExtractionError(
      `Gemini's response could not be parsed as JSON: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  try {
    return buildPlanAnalysisResult(raw, input.fileName, "gemini");
  } catch (err) {
    throw new VisionExtractionError(
      `Failed to post-process Gemini's extraction into a PlanAnalysisResult: ${
        err instanceof Error ? err.message : String(err)
      }`,
      err
    );
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Pulls the plain-text output out of a GenerateContentResponse. The SDK
 * exposes `.text` as a convenience getter in current versions, but we fall
 * back to manually walking `candidates[0].content.parts` in case of SDK
 * version drift, so this keeps working across minor @google/genai releases.
 */
function extractResponseText(response: unknown): string {
  if (response && typeof response === "object") {
    const maybeText = (response as { text?: unknown }).text;
    if (typeof maybeText === "string") return maybeText;
    if (typeof maybeText === "function") {
      const called = (maybeText as () => unknown).call(response);
      if (typeof called === "string") return called;
    }

    const candidates = (response as { candidates?: unknown }).candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const parts = candidates[0]?.content?.parts;
      if (Array.isArray(parts)) {
        return parts
          .map((p: unknown) => (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
          .join("");
      }
    }
  }

  throw new VisionExtractionError("Unrecognized Gemini response shape — unable to locate text output.");
}
