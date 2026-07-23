/**
 * app/api/projects/[id]/issues/route.ts
 * -----------------------------------------------------------------------------
 * GET  /api/projects/:id/issues — list issues for a project (newest first).
 * POST /api/projects/:id/issues — create an issue.
 *
 * Fully try/catch wrapped (unlike the older app/api/projects/:id/tasks/route.ts,
 * which predates this — see the empty-JSON-response bug fixed elsewhere in
 * Settings & Templates: an unhandled Prisma exception here would otherwise
 * produce an empty response body and a client-side JSON parse error).
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createIssue, listIssues } from "@/lib/project-store";
import type { CreateIssueBody, IssueResponseBody, IssuesListResponseBody } from "@/lib/project-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse<IssuesListResponseBody>> {
  try {
    if (!(await requireSession(req))) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }
    return NextResponse.json({ success: true, issues: await listIssues(params.id) }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/projects/:id/issues] GET failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load issues. (Is the database reachable and migrated?)" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse<IssueResponseBody>> {
  try {
    if (!(await requireSession(req))) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }

    let body: CreateIssueBody;
    try {
      body = (await req.json()) as CreateIssueBody;
    } catch {
      return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
    }

    const result = await createIssue(params.id, body);
    if (!result.success || !result.data) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, issue: result.data }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/projects/:id/issues] POST failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to create the issue. (Is the database reachable and migrated?)" },
      { status: 500 }
    );
  }
}
