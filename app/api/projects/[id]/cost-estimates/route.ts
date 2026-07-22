/**
 * app/api/projects/[id]/cost-estimates/route.ts
 * -----------------------------------------------------------------------------
 * GET  /api/projects/:id/cost-estimates — list cost estimates saved to this
 *      project (summary only — see lib/cost-estimate-store.ts).
 * POST /api/projects/:id/cost-estimates — save a cost estimate to this
 *      project. Used both by the Project Management "Cost Estimate" tab and
 *      by the AI Plan Analyzer's "Add to Project" action (which sends
 *      sourceAnalysisId to link it back to the saved Plan Analysis).
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createCostEstimate, listCostEstimates } from "@/lib/cost-estimate-store";
import type { AddCostEstimateToProjectBody, CostEstimateResponseBody, CostEstimatesListResponseBody } from "@/lib/cost-estimate-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse<CostEstimatesListResponseBody>> {
  try {
    if (!(await requireSession(req))) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }
    return NextResponse.json({ success: true, estimates: await listCostEstimates(params.id) }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/projects/:id/cost-estimates] GET failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load cost estimates. (Is the database reachable and migrated?)" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse<CostEstimateResponseBody>> {
  try {
    if (!(await requireSession(req))) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }

    let body: AddCostEstimateToProjectBody;
    try {
      body = (await req.json()) as AddCostEstimateToProjectBody;
    } catch {
      return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
    }

    const result = await createCostEstimate(params.id, body);
    if (!result.success || !result.data) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, costEstimate: result.data }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/projects/:id/cost-estimates] POST failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to save the cost estimate. (Is the database reachable and migrated?)" },
      { status: 500 }
    );
  }
}
