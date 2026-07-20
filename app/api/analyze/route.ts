/**
 * app/api/analyze/route.ts
 * -----------------------------------------------------------------------------
 * POST /api/analyze
 *
 * Accepts an uploaded blueprint (image or PDF) as a base64 payload, rasterizes
 * PDFs to a PNG (first page) using pdfjs-dist + node-canvas, sends the resulting
 * image to the caller's chosen vision provider (Claude or Gemini) for structured
 * extraction, and returns a fully computed PlanAnalysisResult.
 *
 * Runtime: Node.js (not Edge) — pdf rendering requires the `canvas` native
 * module, which is unavailable in the Edge runtime.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { analyzePlanImageWithProvider, VISION_PROVIDERS } from "@/lib/vision-provider";
import { VisionExtractionError } from "@/lib/plan-extraction-schema";
import type { AnalyzeRequestBody, AnalyzeResponseBody, SupportedInputMimeType, VisionProvider } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB
const SUPPORTED_MIME_TYPES: SupportedInputMimeType[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];
const SUPPORTED_PROVIDERS: VisionProvider[] = ["claude", "gemini"];

export async function POST(req: NextRequest): Promise<NextResponse<AnalyzeResponseBody>> {
  let body: AnalyzeRequestBody;

  try {
    body = (await req.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const validationError = validateRequestBody(body);
  if (validationError) {
    return NextResponse.json({ success: false, error: validationError }, { status: 400 });
  }

  try {
    const { imageBase64, mediaType } = await normalizeToImage(body.fileBase64, body.mimeType, body.fileName);

    const result = await analyzePlanImageWithProvider(body.provider, {
      imageBase64,
      mediaType,
      fileName: body.fileName,
      knownScale: body.knownScale,
      referenceMeasurementFt: body.referenceMeasurementFt,
    });

    return NextResponse.json({ success: true, result }, { status: 200 });
  } catch (err) {
    return handleError(err, body.provider);
  }
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

function validateRequestBody(body: AnalyzeRequestBody | undefined): string | null {
  if (!body) return "Missing request body.";
  if (!body.fileBase64 || typeof body.fileBase64 !== "string") {
    return "`fileBase64` is required and must be a base64-encoded string.";
  }
  if (!body.fileName || typeof body.fileName !== "string") {
    return "`fileName` is required.";
  }
  if (!body.mimeType || !SUPPORTED_MIME_TYPES.includes(body.mimeType)) {
    return `\`mimeType\` must be one of: ${SUPPORTED_MIME_TYPES.join(", ")}.`;
  }
  if (!body.provider || !SUPPORTED_PROVIDERS.includes(body.provider)) {
    return `\`provider\` must be one of: ${SUPPORTED_PROVIDERS.join(", ")}.`;
  }

  // Rough byte-size check on the base64 payload (base64 is ~4/3 the size of raw bytes).
  const approxBytes = (body.fileBase64.length * 3) / 4;
  if (approxBytes > MAX_UPLOAD_BYTES) {
    return `File is too large. Max upload size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`;
  }

  if (
    body.referenceMeasurementFt !== undefined &&
    (typeof body.referenceMeasurementFt !== "number" || body.referenceMeasurementFt <= 0)
  ) {
    return "`referenceMeasurementFt`, if provided, must be a positive number.";
  }

  return null;
}

// -----------------------------------------------------------------------------
// PDF -> PNG normalization
// -----------------------------------------------------------------------------

type VisionImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/**
 * Ensures the payload sent to the vision provider is always a plain raster
 * image. If the upload is a PDF, rasterizes the first page to a PNG using
 * pdfjs-dist for parsing/rendering and node-canvas as the rendering surface.
 * This step is provider-agnostic and runs before either Claude or Gemini sees
 * the file.
 */
async function normalizeToImage(
  fileBase64: string,
  mimeType: SupportedInputMimeType,
  fileName: string
): Promise<{ imageBase64: string; mediaType: VisionImageMediaType }> {
  if (mimeType !== "application/pdf") {
    return { imageBase64: fileBase64, mediaType: mimeType as VisionImageMediaType };
  }

  try {
    // Dynamic imports keep these heavyweight, Node-only deps out of the Edge bundle graph.
    const [{ getDocument, GlobalWorkerOptions }, { createCanvas }] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("canvas"),
    ]);

    // Disable the worker in the server runtime; pdfjs runs synchronously in-process instead.
    GlobalWorkerOptions.workerSrc = "";

    const pdfBuffer = Buffer.from(fileBase64, "base64");
    const loadingTask = getDocument({ data: new Uint8Array(pdfBuffer) });
    const pdfDocument = await loadingTask.promise;

    if (pdfDocument.numPages < 1) {
      throw new VisionExtractionError(`"${fileName}" is an empty PDF with no pages.`);
    }

    const page = await pdfDocument.getPage(1);
    const targetDpiScale = 2.5; // Upscale for legibility of hand-drawn detail/labels.
    const viewport = page.getViewport({ scale: targetDpiScale });

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");

    await page.render({
      // node-canvas's 2D context is API-compatible with the browser CanvasRenderingContext2D
      // that pdfjs expects here.
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    const pngBuffer = canvas.toBuffer("image/png");
    return { imageBase64: pngBuffer.toString("base64"), mediaType: "image/png" };
  } catch (err) {
    if (err instanceof VisionExtractionError) throw err;
    throw new VisionExtractionError(
      `Failed to rasterize PDF "${fileName}" for analysis: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }
}

// -----------------------------------------------------------------------------
// Error handling
// -----------------------------------------------------------------------------

function handleError(err: unknown, provider?: VisionProvider): NextResponse<AnalyzeResponseBody> {
  if (err instanceof VisionExtractionError) {
    // eslint-disable-next-line no-console
    console.error(`[api/analyze] VisionExtractionError (${provider ?? "unknown"}):`, err.message, err.cause ?? "");
    return NextResponse.json({ success: false, error: err.message }, { status: 502 });
  }

  // eslint-disable-next-line no-console
  console.error(`[api/analyze] Unexpected error (${provider ?? "unknown"}):`, err);
  const providerLabel = provider ? VISION_PROVIDERS[provider]?.label ?? provider : "the selected provider";
  return NextResponse.json(
    { success: false, error: `An unexpected error occurred while analyzing the plan with ${providerLabel}. Please try again.` },
    { status: 500 }
  );
}
