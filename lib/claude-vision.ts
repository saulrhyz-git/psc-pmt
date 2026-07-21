/**
 * lib/claude-vision.ts
 * -----------------------------------------------------------------------------
 * Anthropic (Claude) provider for the Plan Analyzer.
 *
 * This file only handles Claude-specific API mechanics: building the
 * Anthropic client, wrapping the shared JSON schema in a `Tool` definition,
 * forcing a single tool call, and unwrapping the tool-use block. The prompt
 * text, extraction schema, and all deterministic post-processing math live in
 * `lib/plan-extraction-schema.ts` and are shared with `lib/gemini-vision.ts`
 * so both providers produce identically-shaped results.
 *
 * We force a tool call (`tool_choice: { type: "tool", name: ... }`) rather
 * than asking Claude to "return JSON" in prose — this is the most reliable
 * way to get deterministic, parseable structured output from the model.
 * -----------------------------------------------------------------------------
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PlanAnalysisResult } from "./types";
import { getClaudeApiKey, getClaudeModel } from "./ai-settings";
import {
  buildPlanAnalysisResult,
  buildUserPrompt,
  PLAN_EXTRACTION_JSON_SCHEMA,
  RawExtraction,
  SYSTEM_PROMPT,
  VisionExtractionError,
} from "./plan-extraction-schema";

// -----------------------------------------------------------------------------
// Client setup
// -----------------------------------------------------------------------------

/**
 * Builds a fresh Anthropic client using whatever API key is currently active
 * (in-app Settings panel takes precedence over ANTHROPIC_API_KEY — see
 * lib/ai-settings.ts). Deliberately NOT cached as a module-level singleton:
 * the key can change at runtime via the Settings panel, and re-instantiating
 * the SDK client per call is cheap enough that a stale-key bug isn't worth
 * the trade-off.
 */
async function getClient(): Promise<Anthropic> {
  const { value: apiKey } = await getClaudeApiKey();
  if (!apiKey) {
    throw new VisionExtractionError(
      "No Anthropic API key configured. Add one in the app's Settings panel, or set ANTHROPIC_API_KEY in your environment, before selecting Claude as the analysis provider — or switch to the Gemini provider instead."
    );
  }

  return new Anthropic({ apiKey });
}

/** Re-exported under the old name for backwards compatibility with any existing imports. */
export const ClaudeVisionError = VisionExtractionError;

// -----------------------------------------------------------------------------
// Tool definition (Claude-specific envelope around the shared JSON schema)
// -----------------------------------------------------------------------------

const PLAN_EXTRACTION_TOOL: Anthropic.Tool = {
  name: "extract_plan_data",
  description:
    "Records the complete structured extraction of an architectural floor plan image, including layout description, scale calibration, rooms, walls, openings, fixtures, space planning comments, and furniture suggestions.",
  // The shared schema is plain JSON Schema, which is exactly what Anthropic's
  // tool `input_schema` expects.
  input_schema: PLAN_EXTRACTION_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export interface AnalyzePlanImageInput {
  /** Base64-encoded image bytes (no data: URL prefix). PDFs must be pre-rasterized to an image before calling this. */
  imageBase64: string;
  /** Media type of the base64 image payload. */
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  fileName: string;
  knownScale?: string;
  referenceMeasurementFt?: number;
}

/**
 * Sends a floor plan image to Claude and returns a fully computed
 * PlanAnalysisResult, with all derived measurements calculated deterministically
 * from the model's raw geometry extraction.
 */
export async function analyzePlanImage(input: AnalyzePlanImageInput): Promise<PlanAnalysisResult> {
  const client = await getClient();
  // getClaudeModel() always resolves to a string (settings → env → built-in
  // default), but its type is string | undefined for symmetry with the API
  // key getters, so we fall back defensively here to keep the SDK call typed.
  const model = (await getClaudeModel()).value ?? "claude-3-5-sonnet-20241022";

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: [PLAN_EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "extract_plan_data" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.mediaType,
                data: input.imageBase64,
              },
            },
            {
              type: "text",
              text: buildUserPrompt(input.fileName, input.knownScale, input.referenceMeasurementFt),
            },
          ],
        },
      ],
    });
  } catch (err) {
    throw new VisionExtractionError(
      `Claude Vision API request failed: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  const toolUseBlock = response.content.find(
    (block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === "extract_plan_data"
  );

  if (!toolUseBlock) {
    throw new VisionExtractionError(
      "Claude did not return the expected extract_plan_data tool call. The model may have refused or the image may be unreadable."
    );
  }

  const raw = toolUseBlock.input as RawExtraction;

  try {
    return buildPlanAnalysisResult(raw, input.fileName, "claude");
  } catch (err) {
    throw new VisionExtractionError(
      `Failed to post-process Claude's extraction into a PlanAnalysisResult: ${
        err instanceof Error ? err.message : String(err)
      }`,
      err
    );
  }
}
