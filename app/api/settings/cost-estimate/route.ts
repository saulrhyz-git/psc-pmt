/**
 * app/api/settings/cost-estimate/route.ts
 * -----------------------------------------------------------------------------
 * GET  /api/settings/cost-estimate  — returns the current admin-configured
 *                                      default unit costs (fully resolved,
 *                                      falling back to DEFAULT_UNIT_COST_SETTINGS
 *                                      for any field never customized). Any
 *                                      signed-in user may read this — it's
 *                                      how components/MaterialEstimator.tsx
 *                                      seeds its starting point for everyone,
 *                                      not just admins, and none of these
 *                                      numbers are sensitive.
 * POST /api/settings/cost-estimate  — updates one or more default unit costs.
 *                                      Admin-only to write (see rationale
 *                                      below). Applies immediately.
 *
 * Write access is admin-only, same rationale as app/api/settings/route.ts
 * (AI provider settings): these are shared, app-wide defaults, not a
 * per-user preference — a student changing them would move the starting
 * point for every estimate everyone else creates. (Placeholder until
 * role-based permissions exist; see lib/cost-settings.ts's header comment.)
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { getCostEstimateDefaults, updateCostEstimateDefaults } from "@/lib/cost-settings";
import { requireAdmin, requireSession } from "@/lib/auth";
import type { CostEstimateDefaultsResponseBody, CostEstimateDefaultsUpdateBody, UnitCostSettings } from "@/lib/types";

export const runtime = "nodejs";

const ALLOWED_KEYS: (keyof UnitCostSettings)[] = [
  "paintPerSqM",
  "drywallPerSqM",
  "flooringPerSqM",
  "trimPerLinearM",
  "laborRatePerHour",
  "laborHoursPerSqM",
  "contingencyPercent",
];

export async function GET(req: NextRequest): Promise<NextResponse<CostEstimateDefaultsResponseBody>> {
  try {
    if (!(await requireSession(req))) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }

    const settings = await getCostEstimateDefaults();
    return NextResponse.json({ success: true, settings }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/settings/cost-estimate] GET failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to read cost estimate defaults. (Is the database reachable and migrated?)" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<CostEstimateDefaultsResponseBody>> {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
    }

    let body: CostEstimateDefaultsUpdateBody;
    try {
      body = (await req.json()) as CostEstimateDefaultsUpdateBody;
    } catch {
      return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
    }

    const validationError = validateBody(body);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const settings = await updateCostEstimateDefaults(body);
    return NextResponse.json({ success: true, settings }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/settings/cost-estimate] POST failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save cost estimate defaults. (Is the database reachable and migrated?)" },
      { status: 500 }
    );
  }
}

function validateBody(body: CostEstimateDefaultsUpdateBody | undefined): string | null {
  if (!body || typeof body !== "object") return "Missing request body.";

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.includes(key as keyof UnitCostSettings)) {
      return `Unknown settings field: "${key}".`;
    }
    if (value !== undefined && (typeof value !== "number" || Number.isNaN(value) || value < 0)) {
      return `"${key}" must be a non-negative number.`;
    }
  }

  return null;
}
