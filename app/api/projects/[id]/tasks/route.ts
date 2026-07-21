/**
 * app/api/projects/[id]/tasks/route.ts
 * -----------------------------------------------------------------------------
 * GET  /api/projects/:id/tasks — list tasks for a project (sorted by start date).
 * POST /api/projects/:id/tasks — create a task.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createTask, listTasks } from "@/lib/project-store";
import type { CreateTaskBody, TaskResponseBody, TasksListResponseBody } from "@/lib/project-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse<TasksListResponseBody>> {
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }
  return NextResponse.json({ success: true, tasks: listTasks(params.id) }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse<TaskResponseBody>> {
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: CreateTaskBody;
  try {
    body = (await req.json()) as CreateTaskBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = createTask(params.id, body);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, task: result.data }, { status: 201 });
}
