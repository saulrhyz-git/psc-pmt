/**
 * app/api/projects/route.ts
 * -----------------------------------------------------------------------------
 * GET  /api/projects — list all projects.
 * POST /api/projects — create a new project.
 *
 * Access: any signed-in user (admin or student) — see lib/project-types.ts's
 * header comment for the access-control decision behind Tool #2.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createProject, listProjects } from "@/lib/project-store";
import type { CreateProjectBody, ProjectResponseBody, ProjectsListResponseBody } from "@/lib/project-types";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse<ProjectsListResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  try {
    return NextResponse.json({ success: true, projects: await listProjects() }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/projects] GET failed:", err);
    return NextResponse.json({ success: false, error: "Failed to list projects." }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ProjectResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: CreateProjectBody;
  try {
    body = (await req.json()) as CreateProjectBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = await createProject(body);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, project: result.data }, { status: 201 });
}
