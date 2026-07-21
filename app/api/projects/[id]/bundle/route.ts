/**
 * app/api/projects/[id]/bundle/route.ts
 * -----------------------------------------------------------------------------
 * GET /api/projects/:id/bundle — the project plus all of its tasks, budget
 * line items, crew, and equipment in one response. Used by the Project
 * Management dashboard (KPIs, Gantt, budget tracker, resources) to avoid five
 * separate round-trips every time the selected project changes.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getProjectBundle } from "@/lib/project-store";
import type { ProjectBundleResponseBody } from "@/lib/project-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse<ProjectBundleResponseBody>> {
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const bundle = getProjectBundle(params.id);
  if (!bundle) {
    return NextResponse.json({ success: false, error: `Project "${params.id}" not found.` }, { status: 404 });
  }
  return NextResponse.json({ success: true, bundle }, { status: 200 });
}
