/**
 * app/api/projects/[id]/equipment/route.ts
 * -----------------------------------------------------------------------------
 * GET  /api/projects/:id/equipment — list equipment tracked for a project.
 * POST /api/projects/:id/equipment — add an equipment item.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createEquipment, listEquipment } from "@/lib/project-store";
import type { CreateEquipmentBody, EquipmentListResponseBody, EquipmentResponseBody } from "@/lib/project-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse<EquipmentListResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }
  return NextResponse.json({ success: true, equipment: await listEquipment(params.id) }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse<EquipmentResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: CreateEquipmentBody;
  try {
    body = (await req.json()) as CreateEquipmentBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = await createEquipment(params.id, body);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, item: result.data }, { status: 201 });
}
