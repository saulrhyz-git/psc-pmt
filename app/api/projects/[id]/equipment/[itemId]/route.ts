/**
 * app/api/projects/[id]/equipment/[itemId]/route.ts
 * -----------------------------------------------------------------------------
 * PATCH  /api/projects/:id/equipment/:itemId — update an equipment item.
 * DELETE /api/projects/:id/equipment/:itemId — remove an equipment item.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteEquipment, updateEquipment } from "@/lib/project-store";
import type { EquipmentResponseBody, UpdateEquipmentBody } from "@/lib/project-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string; itemId: string };
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<NextResponse<EquipmentResponseBody>> {
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: UpdateEquipmentBody;
  try {
    body = (await req.json()) as UpdateEquipmentBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = updateEquipment(params.id, params.itemId, body);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, item: result.data }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse<{ success: boolean; error?: string }>> {
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const result = deleteEquipment(params.id, params.itemId);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 404 });
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
