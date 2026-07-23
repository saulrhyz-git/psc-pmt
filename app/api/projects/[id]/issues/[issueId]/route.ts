/**
 * app/api/projects/[id]/issues/[issueId]/route.ts
 * -----------------------------------------------------------------------------
 * PATCH  /api/projects/:id/issues/:issueId — update an issue (status, priority,
 *        assignee, etc.). resolvedAt is managed automatically by
 *        lib/project-store.ts's updateIssue based on the status transition —
 *        it isn't a settable field on the request body.
 * DELETE /api/projects/:id/issues/:issueId — remove an issue.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteIssue, updateIssue } from "@/lib/project-store";
import type { IssueResponseBody, UpdateIssueBody } from "@/lib/project-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string; issueId: string };
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<NextResponse<IssueResponseBody>> {
  try {
    if (!(await requireSession(req))) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }

    let body: UpdateIssueBody;
    try {
      body = (await req.json()) as UpdateIssueBody;
    } catch {
      return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
    }

    const result = await updateIssue(params.id, params.issueId, body);
    if (!result.success || !result.data) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, issue: result.data }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/projects/:id/issues/:issueId] PATCH failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to update the issue. (Is the database reachable and migrated?)" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse<{ success: boolean; error?: string }>> {
  try {
    if (!(await requireSession(req))) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }

    const result = await deleteIssue(params.id, params.issueId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 404 });
    }
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/projects/:id/issues/:issueId] DELETE failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete the issue. (Is the database reachable and migrated?)" },
      { status: 500 }
    );
  }
}
