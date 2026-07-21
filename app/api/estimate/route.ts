/**
 * app/api/estimate/route.ts
 * -----------------------------------------------------------------------------
 * POST /api/estimate
 *
 * Takes the room measurements produced by /api/analyze plus a set of editable
 * unit costs (paint, drywall, flooring, trim, labor) and returns an itemized
 * MaterialEstimate. This runs entirely deterministically server-side (no LLM
 * call) so estimates stay stable and auditable as the contractor tweaks costs.
 *
 * The actual pricing math lives in `lib/estimate-utils.ts` so it can also be
 * imported directly by `components/MaterialEstimator.tsx` for instant
 * client-side recalculation without a network round-trip on every keystroke.
 * This route file stays a thin, server-only HTTP wrapper (validation + the
 * `next/server` types), which keeps it safe to never import from client code.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import type { EstimateRequestBody, EstimateResponseBody, UnitCostSettings } from "@/lib/types";
import { computeMaterialEstimate } from "@/lib/estimate-utils";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse<EstimateResponseBody>> {
  // middleware.ts already blocks requests with no session cookie at all, but
  // it can't verify the cookie's signature (no fs access on the Edge
  // runtime) — this is the real authorization check.
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: EstimateRequestBody;

  try {
    body = (await req.json()) as EstimateRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validationError = validateBody(body);
  if (validationError) {
    return NextResponse.json({ success: false, error: validationError }, { status: 400 });
  }

  try {
    const estimate = computeMaterialEstimate(body.rooms, body.unitCostSettings);
    return NextResponse.json({ success: true, estimate }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/estimate] Failed to compute estimate:", err);
    return NextResponse.json(
      { success: false, error: "Failed to compute material estimate. Please check your inputs and try again." },
      { status: 500 }
    );
  }
}

function validateBody(body: EstimateRequestBody | undefined): string | null {
  if (!body) return "Missing request body.";
  if (!Array.isArray(body.rooms) || body.rooms.length === 0) {
    return "`rooms` must be a non-empty array.";
  }
  if (!body.unitCostSettings || typeof body.unitCostSettings !== "object") {
    return "`unitCostSettings` is required.";
  }
  const requiredKeys: (keyof UnitCostSettings)[] = [
    "paintPerSqFt",
    "drywallPerSqFt",
    "flooringPerSqFt",
    "trimPerLinearFt",
    "laborRatePerHour",
    "laborHoursPerSqFt",
    "contingencyPercent",
  ];
  for (const key of requiredKeys) {
    const value = body.unitCostSettings[key];
    if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
      return `\`unitCostSettings.${key}\` must be a non-negative number.`;
    }
  }
  return null;
}
