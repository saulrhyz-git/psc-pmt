/**
 * app/api/projects/[id]/route.ts
 * -----------------------------------------------------------------------------
 * GET    /api/projects/:id — a single project.
 * PATCH  /api/projects/:id — update project fields.
 * DELETE /api/projects/:id — delete a project (cascades to its tasks, budget
 *                              line items, crew, and equipment).
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteProject, getProject, updateProject } from "@/lib/project-store";
import type { ProjectResponseBody, UpdateProjectBody } from "@/lib/project-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse<ProjectResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const project = await getProject(params.id);
  if (!project) {
    return NextResponse.json({ success: false, error: `Project "${params.id}" not found.` }, { status: 404 });
  }
  return NextResponse.json({ success: true, project }, { status: 200 });
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<NextResponse<ProjectResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: UpdateProjectBody;
  try {
    body = (await req.json()) as UpdateProjectBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = await updateProject(params.id, body);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, project: result.data }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse<{ success: boolean; error?: string }>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const result = await deleteProject(params.id);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 404 });
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
