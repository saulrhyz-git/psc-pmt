/**
 * app/api/projects/[id]/reference-files/[fileId]/route.ts
 * -----------------------------------------------------------------------------
 * GET    /api/projects/:id/reference-files/:fileId — download a reference
 *        file's raw bytes with its original content type.
 * DELETE /api/projects/:id/reference-files/:fileId — remove a reference file.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteReferenceFile, getReferenceFileWithData } from "@/lib/reference-file-store";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string; fileId: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const found = await getReferenceFileWithData(params.id, params.fileId);
  if (!found) {
    return NextResponse.json({ success: false, error: `Reference file "${params.fileId}" not found.` }, { status: 404 });
  }

  const safeFileName = found.meta.fileName.replace(/["\r\n]/g, "_");
  return new NextResponse(new Blob([Uint8Array.from(found.data)]), {
    status: 200,
    headers: {
      "Content-Type": found.meta.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeFileName}"`,
      "Content-Length": String(found.meta.fileSize),
    },
  });
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse<{ success: boolean; error?: string }>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const result = await deleteReferenceFile(params.id, params.fileId);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 404 });
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
