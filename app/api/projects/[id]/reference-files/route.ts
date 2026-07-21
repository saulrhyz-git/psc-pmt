/**
 * app/api/projects/[id]/reference-files/route.ts
 * -----------------------------------------------------------------------------
 * GET  /api/projects/:id/reference-files — list a project's reference file
 *      library (metadata only — no file bytes, see lib/reference-file-store.ts).
 * POST /api/projects/:id/reference-files — upload a reference file (base64
 *      body, same access level as the rest of Project Management: any
 *      signed-in user).
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createReferenceFile, listReferenceFiles } from "@/lib/reference-file-store";
import type { ReferenceFileResponseBody, ReferenceFilesListResponseBody, UploadReferenceFileBody } from "@/lib/reference-file-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse<ReferenceFilesListResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }
  return NextResponse.json({ success: true, files: await listReferenceFiles(params.id) }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse<ReferenceFileResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: UploadReferenceFileBody;
  try {
    body = (await req.json()) as UploadReferenceFileBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = await createReferenceFile(params.id, body);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, file: result.data }, { status: 201 });
}
