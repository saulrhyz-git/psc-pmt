/**
 * app/api/projects/[id]/tasks/[taskId]/route.ts
 * -----------------------------------------------------------------------------
 * PATCH  /api/projects/:id/tasks/:taskId — update a task (status, progress, dates, etc.)
 * DELETE /api/projects/:id/tasks/:taskId — remove a task.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteTask, updateTask } from "@/lib/project-store";
import type { TaskResponseBody, UpdateTaskBody } from "@/lib/project-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string; taskId: string };
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<NextResponse<TaskResponseBody>> {
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: UpdateTaskBody;
  try {
    body = (await req.json()) as UpdateTaskBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = updateTask(params.id, params.taskId, body);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, task: result.data }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse<{ success: boolean; error?: string }>> {
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const result = deleteTask(params.id, params.taskId);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 404 });
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
