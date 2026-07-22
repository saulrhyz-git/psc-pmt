/**
 * app/api/projects/[id]/cost-estimates/[estimateId]/route.ts
 * -----------------------------------------------------------------------------
 * GET    /api/projects/:id/cost-estimates/:estimateId — full saved cost
 *        estimate detail (line items + the settings used to produce them),
 *        for the Project Management tab's detail view.
 * DELETE /api/projects/:id/cost-estimates/:estimateId — remove a saved cost
 *        estimate. Does not affect its source Plan Analysis, if any.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteCostEstimate, getCostEstimate } from "@/lib/cost-estimate-store";
import type { CostEstimateResponseBody } from "@/lib/cost-estimate-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string; estimateId: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse<CostEstimateResponseBody>> {
  try {
    if (!(await requireSession(req))) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }

    const costEstimate = await getCostEstimate(params.id, params.estimateId);
    if (!costEstimate) {
      return NextResponse.json({ success: false, error: `Cost estimate "${params.estimateId}" not found.` }, { status: 404 });
    }
    return NextResponse.json({ success: true, costEstimate }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/projects/:id/cost-estimates/:estimateId] GET failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load this cost estimate. (Is the database reachable and migrated?)" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse<{ success: boolean; error?: string }>> {
  try {
    if (!(await requireSession(req))) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }

    const result = await deleteCostEstimate(params.id, params.estimateId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 404 });
    }
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/projects/:id/cost-estimates/:estimateId] DELETE failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete this cost estimate. (Is the database reachable and migrated?)" },
      { status: 500 }
    );
  }
}
