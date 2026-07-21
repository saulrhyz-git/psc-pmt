/**
 * app/api/analyze/route.ts
 * -----------------------------------------------------------------------------
 * POST /api/analyze
 *
 * Accepts an uploaded blueprint (image or PDF) as a base64 payload, rasterizes
 * PDFs to a PNG (first page) using `mupdf`, sends the resulting image to the
 * caller's chosen vision provider (Claude or Gemini) for structured
 * extraction, and returns a fully computed PlanAnalysisResult.
 *
 * Why mupdf and not pdfjs-dist + node-canvas: that combination has a known,
 * currently-unresolved upstream bug where rendering a PDF page containing an
 * embedded raster image throws `TypeError: Image or Canvas expected` (see
 * mozilla/pdf.js#19566, #19794, Automattic/node-canvas#2349) — pdfjs-dist's
 * internal worker/message-handler abstraction hands decoded images to the
 * canvas context as plain objects that fail node-canvas's `instanceof`
 * checks. `mupdf` is a WASM build of MuPDF with a synchronous API and no
 * canvas/worker abstraction in the way, which sidesteps the bug entirely —
 * and as a bonus requires no native compilation (unlike `canvas`, which
 * needs Cairo/Pango and a C++ toolchain to build from source).
 *
 * License note: `mupdf` is AGPL-3.0-or-later (commercial licenses available
 * from Artifex — see https://artifex.com/contact/mupdf-js). That's a
 * meaningfully different license posture than the rest of this project's
 * dependencies (all permissive). Fine for local/classroom use; worth a
 * second look before distributing this as a hosted service to others.
 *
 * Runtime: Node.js (not Edge) — mupdf's WASM module needs Node's filesystem
 * APIs to load, which aren't available in the Edge runtime.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { analyzePlanImageWithProvider, VISION_PROVIDERS } from "@/lib/vision-provider";
import { VisionExtractionError } from "@/lib/plan-extraction-schema";
import { requireSession } from "@/lib/auth";
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
  // middleware.ts already blocks requests with no session cookie at all, but
  // it can't verify the cookie's signature (no fs access on the Edge
  // runtime) — this is the real authorization check.
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

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

/** Render scale relative to the PDF's native 72 DPI (2.5 ≈ 180 DPI) — upscaled for legibility of hand-drawn detail/labels. */
const PDF_RENDER_SCALE = 2.5;

/**
 * Ensures the payload sent to the vision provider is always a plain raster
 * image. If the upload is a PDF, rasterizes the first page to a PNG using
 * `mupdf` (see the license/rationale note in this file's header comment).
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
    // Dynamic import keeps this heavyweight, Node-only dep out of the Edge bundle graph.
    const mupdf = await import("mupdf");

    const pdfBuffer = Buffer.from(fileBase64, "base64");
    const document = mupdf.Document.openDocument(pdfBuffer, "application/pdf");

    if (document.countPages() < 1) {
      throw new VisionExtractionError(`"${fileName}" is an empty PDF with no pages.`);
    }

    const page = document.loadPage(0); // mupdf pages are 0-indexed; we always take the first page.
    const matrix = mupdf.Matrix.scale(PDF_RENDER_SCALE, PDF_RENDER_SCALE);
    // alpha: false -> opaque white background (better for a vision model than transparency).
    // showExtras: true -> include annotations/form field appearances, matching what a viewer would see.
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
    const pngBytes = pixmap.asPNG();

    return { imageBase64: Buffer.from(pngBytes).toString("base64"), mediaType: "image/png" };
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
