/**
 * app/api/projects/[id]/plan-analyses/[analysisId]/route.ts
 * -----------------------------------------------------------------------------
 * GET    /api/projects/:id/plan-analyses/:analysisId — full saved analysis
 *        detail (complete PlanAnalysisResult), for the Project Management
 *        tab's detail view.
 * DELETE /api/projects/:id/plan-analyses/:analysisId — remove a saved
 *        analysis. Does NOT delete its generated PDF report (see
 *        prisma/schema.prisma's ReferenceFile.sourceAnalysisId onDelete:
 *        SetNull) — the report stands on its own in the reference library.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deletePlanAnalysis, getPlanAnalysis } from "@/lib/plan-analysis-store";
import type { PlanAnalysisResponseBody } from "@/lib/plan-analysis-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string; analysisId: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse<PlanAnalysisResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const analysis = await getPlanAnalysis(params.id, params.analysisId);
  if (!analysis) {
    return NextResponse.json({ success: false, error: `Plan analysis "${params.analysisId}" not found.` }, { status: 404 });
  }
  return NextResponse.json({ success: true, analysis }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse<{ success: boolean; error?: string }>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const result = await deletePlanAnalysis(params.id, params.analysisId);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 404 });
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
