/**
 * app/api/projects/[id]/crew/route.ts
 * -----------------------------------------------------------------------------
 * GET  /api/projects/:id/crew — list crew members assigned to a project.
 * POST /api/projects/:id/crew — add a crew member.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createCrewMember, listCrew } from "@/lib/project-store";
import type { CreateCrewMemberBody, CrewListResponseBody, CrewMemberResponseBody } from "@/lib/project-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse<CrewListResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }
  return NextResponse.json({ success: true, crew: await listCrew(params.id) }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse<CrewMemberResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: CreateCrewMemberBody;
  try {
    body = (await req.json()) as CreateCrewMemberBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = await createCrewMember(params.id, body);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, member: result.data }, { status: 201 });
}
