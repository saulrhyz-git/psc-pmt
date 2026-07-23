/**
 * lib/kimi-vision.ts
 * -----------------------------------------------------------------------------
 * Moonshot AI (Kimi) provider for the Plan Analyzer.
 *
 * Kimi's API (https://api.moonshot.ai/v1) is Chat-Completions-compatible with
 * OpenAI's API — same request/response shape, just a different base URL and
 * model id. Rather than pull in a whole new SDK dependency for that, this
 * talks to it with a plain `fetch()` call. Like lib/claude-vision.ts and
 * lib/gemini-vision.ts, this file only handles Kimi-specific API mechanics;
 * the prompt text, extraction schema, and all deterministic post-processing
 * math live in lib/plan-extraction-schema.ts and are shared across all three
 * providers so results are shaped identically regardless of which one a user
 * picks.
 *
 * Structured output via `tools` + `tool_choice`, same reliability rationale
 * as Claude's forced `tool_choice` and Gemini's `responseSchema` — but with
 * one Kimi-specific wrinkle confirmed against Moonshot's docs
 * (https://platform.kimi.ai/docs/guide/use-tool-choice): K3 always runs with
 * thinking enabled, and forcing a *specific* named tool
 * (`tool_choice: { type: "function", function: { name } }`) is incompatible
 * with thinking — the API rejects it with a 400
 * (`tool_choice 'specified' is incompatible with thinking enabled`). So we
 * use `tool_choice: "auto"` instead (the documented default) and rely on a
 * single declared tool + explicit prompt instructions to get the model to
 * call it — see extractErrorDetail's caller below for what happens if it
 * doesn't.
 *
 * temperature is also fixed by the model service at 1.0 for K3 (per the same
 * docs: "temperature=1.0 ... are fixed"); we still send it explicitly for
 * clarity rather than omit it, since sending the fixed value is a no-op.
 *
 * Kimi K3 (the current flagship as of mid-2026) has native image/vision
 * understanding built in — no separate vision-only model needed.
 * -----------------------------------------------------------------------------
 */

import type { PlanAnalysisResult } from "./types";
import { getKimiApiKey, getKimiModel } from "./ai-settings";
import {
  buildPlanAnalysisResult,
  buildUserPrompt,
  PLAN_EXTRACTION_JSON_SCHEMA,
  RawExtraction,
  SYSTEM_PROMPT,
  VisionExtractionError,
} from "./plan-extraction-schema";

const KIMI_API_BASE = "https://api.moonshot.ai/v1";
const EXTRACT_FUNCTION_NAME = "extract_plan_data";

/** Re-exported for symmetry with lib/claude-vision.ts's ClaudeVisionError / lib/gemini-vision.ts's GeminiVisionError. */
export const KimiVisionError = VisionExtractionError;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export interface AnalyzePlanImageWithKimiInput {
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
 * Sends a floor plan image to Kimi (Moonshot AI) and returns a fully computed
 * PlanAnalysisResult, with all derived measurements calculated deterministically
 * from the model's raw geometry extraction (same post-processing pipeline as
 * the other two providers).
 */
export async function analyzePlanImageWithKimi(input: AnalyzePlanImageWithKimiInput): Promise<PlanAnalysisResult> {
  const { value: apiKey } = await getKimiApiKey();
  if (!apiKey) {
    throw new VisionExtractionError(
      "No Kimi (Moonshot AI) API key configured. Add one in the app's Settings panel, or get a key at https://platform.moonshot.ai/console/api-keys and set KIMI_API_KEY in your environment, before selecting Kimi as the analysis provider."
    );
  }
  // getKimiModel() always resolves to a string (settings → env → built-in
  // default), but its type is string | undefined for symmetry with the API
  // key getters, so we fall back defensively here to keep the request typed.
  const model = (await getKimiModel()).value ?? "kimi-k3";

  const requestBody = {
    model,
    // Fixed at 1.0 by the model service regardless of what's sent (see
    // header comment) — sent explicitly rather than omitted for clarity.
    temperature: 1,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            // SYSTEM_PROMPT (shared with Claude/Gemini) tells the model to
            // "respond with ONLY the JSON object" — correct for those two
            // providers, whose structured-output mechanisms are independent
            // of message content. But with Kimi's tool_choice: "auto" (see
            // header comment for why it can't be forced), that phrasing
            // could lead the model to paste JSON into the reply text instead
            // of actually calling extract_plan_data. This line overrides
            // that for Kimi specifically, appended after the shared prompt.
            text:
              buildUserPrompt(input.fileName, input.knownScale, input.referenceMeasurementM, input.context) +
              `\n\nCall the ${EXTRACT_FUNCTION_NAME} function with your complete answer as its arguments — do not reply with plain text or JSON in the message content.`,
          },
          {
            type: "image_url",
            image_url: { url: `data:${input.mediaType};base64,${input.imageBase64}` },
          },
        ],
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: EXTRACT_FUNCTION_NAME,
          description:
            "Records the complete structured extraction of an architectural floor plan image, including layout description, scale calibration, rooms, walls, openings, fixtures, space planning comments, and furniture suggestions.",
          parameters: PLAN_EXTRACTION_JSON_SCHEMA,
        },
      },
    ],
    // NOT a forced-specific-function tool_choice — K3 always thinks, and
    // forcing a named tool 400s when thinking is enabled (see header
    // comment). "auto" is the documented default; the single declared tool
    // plus SYSTEM_PROMPT/buildUserPrompt's instructions are what actually
    // get it called reliably.
    tool_choice: "auto",
  };

  let response: Response;
  try {
    response = await fetch(`${KIMI_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    throw new VisionExtractionError(`Kimi API request failed: ${err instanceof Error ? err.message : String(err)}`, err);
  }

  if (!response.ok) {
    const detail = await extractErrorDetail(response);
    throw new VisionExtractionError(
      `Kimi API request failed with status ${response.status}${detail ? `: ${detail}` : "."}`
    );
  }

  let payload: KimiChatCompletionResponse;
  try {
    payload = (await response.json()) as KimiChatCompletionResponse;
  } catch (err) {
    throw new VisionExtractionError(
      `Kimi's response could not be parsed as JSON: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  const toolCall = payload.choices?.[0]?.message?.tool_calls?.find(
    (tc) => tc.function?.name === EXTRACT_FUNCTION_NAME
  );

  if (!toolCall?.function?.arguments) {
    throw new VisionExtractionError(
      "Kimi did not return the expected extract_plan_data function call. The model may have refused or the image may be unreadable."
    );
  }

  let raw: RawExtraction;
  try {
    raw = JSON.parse(toolCall.function.arguments) as RawExtraction;
  } catch (err) {
    throw new VisionExtractionError(
      `Kimi's function-call arguments could not be parsed as JSON: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  try {
    return buildPlanAnalysisResult(raw, input.fileName, "kimi");
  } catch (err) {
    throw new VisionExtractionError(
      `Failed to post-process Kimi's extraction into a PlanAnalysisResult: ${
        err instanceof Error ? err.message : String(err)
      }`,
      err
    );
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

interface KimiChatCompletionResponse {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
}

/** Best-effort extraction of an error message from a non-OK response body (OpenAI-style `{ error: { message } }`). */
async function extractErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body?.error?.message ?? "";
  } catch {
    return "";
  }
}
