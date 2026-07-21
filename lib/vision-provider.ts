/**
 * lib/vision-provider.ts
 * -----------------------------------------------------------------------------
 * Single entry point that dispatches a plan-analysis request to whichever
 * vision provider the user selected (Claude or Gemini), plus the metadata
 * `components/ProviderSelector.tsx` uses to render provider options in the UI.
 *
 * Keeping this dispatch logic out of app/api/analyze/route.ts keeps the route
 * file focused on HTTP concerns (validation, PDF rasterization) and makes it
 * trivial to add a third provider later — implement `analyzePlanImageWith<X>`
 * in its own lib/<x>-vision.ts file (sharing lib/plan-extraction-schema.ts),
 * then add one case here and one entry to VISION_PROVIDERS.
 * -----------------------------------------------------------------------------
 */

import type { PlanAnalysisResult, VisionProvider } from "./types";
import { analyzePlanImage } from "./claude-vision";
import { analyzePlanImageWithGemini } from "./gemini-vision";
import { VisionExtractionError } from "./plan-extraction-schema";

// Re-exported so server-side callers (e.g. this file's own error messages,
// or any other server module) have one place to import provider metadata
// from without needing to know it physically lives in a separate,
// client-safe module. Client Components should import directly from
// lib/vision-provider-metadata.ts instead of this file, since this file
// transitively pulls in the Anthropic and Google SDKs.
export { VISION_PROVIDERS, VISION_PROVIDER_ORDER } from "./vision-provider-metadata";

export interface AnalyzePlanImageInput {
  imageBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  fileName: string;
  knownScale?: string;
  referenceMeasurementFt?: number;
  /** Optional free-text context appended to the model's user prompt — see lib/plan-extraction-schema.ts. */
  context?: string;
}

/**
 * Routes a plan-analysis request to the selected provider. Both providers
 * return an identically-shaped PlanAnalysisResult (see
 * lib/plan-extraction-schema.ts), so callers never need to branch on which
 * one was used after this point.
 */
export async function analyzePlanImageWithProvider(
  provider: VisionProvider,
  input: AnalyzePlanImageInput
): Promise<PlanAnalysisResult> {
  switch (provider) {
    case "claude":
      return analyzePlanImage(input);
    case "gemini":
      return analyzePlanImageWithGemini(input);
    default: {
      const _exhaustive: never = provider;
      throw new VisionExtractionError(`Unknown vision provider: ${String(_exhaustive)}`);
    }
  }
}
