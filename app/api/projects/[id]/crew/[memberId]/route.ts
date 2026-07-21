/**
 * app/api/projects/[id]/crew/[memberId]/route.ts
 * -----------------------------------------------------------------------------
 * PATCH  /api/projects/:id/crew/:memberId — update a crew member.
 * DELETE /api/projects/:id/crew/:memberId — remove a crew member.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteCrewMember, updateCrewMember } from "@/lib/project-store";
import type { CrewMemberResponseBody, UpdateCrewMemberBody } from "@/lib/project-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string; memberId: string };
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<NextResponse<CrewMemberResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: UpdateCrewMemberBody;
  try {
    body = (await req.json()) as UpdateCrewMemberBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = await updateCrewMember(params.id, params.memberId, body);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, member: result.data }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse<{ success: boolean; error?: string }>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const result = await deleteCrewMember(params.id, params.memberId);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 404 });
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
