/**
 * app/api/projects/[id]/plan-analyses/route.ts
 * -----------------------------------------------------------------------------
 * GET  /api/projects/:id/plan-analyses — list plan analyses saved to this
 *      project (summary only — see lib/plan-analysis-store.ts).
 * POST /api/projects/:id/plan-analyses — "Add to Project" from the AI Plan
 *      Analyzer: persists the full analysis result and generates a PDF
 *      report into this project's Reference Files library, atomically.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getProject } from "@/lib/project-store";
import { createPlanAnalysis, listPlanAnalyses } from "@/lib/plan-analysis-store";
import type { AddPlanAnalysisToProjectBody, PlanAnalysesListResponseBody, PlanAnalysisResponseBody } from "@/lib/plan-analysis-types";

export const runtime = "nodejs";
export const maxDuration = 30;

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse<PlanAnalysesListResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }
  return NextResponse.json({ success: true, analyses: await listPlanAnalyses(params.id) }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse<PlanAnalysisResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: AddPlanAnalysisToProjectBody;
  try {
    body = (await req.json()) as AddPlanAnalysisToProjectBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const project = await getProject(params.id);
  if (!project) {
    return NextResponse.json({ success: false, error: `Project "${params.id}" not found.` }, { status: 404 });
  }

  const result = await createPlanAnalysis(params.id, project.name, body);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, analysis: result.data }, { status: 201 });
}
