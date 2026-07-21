/**
 * app/api/projects/[id]/budget/[lineItemId]/route.ts
 * -----------------------------------------------------------------------------
 * PATCH  /api/projects/:id/budget/:lineItemId — update a budget line item.
 * DELETE /api/projects/:id/budget/:lineItemId — remove a budget line item.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteBudgetLineItem, updateBudgetLineItem } from "@/lib/project-store";
import type { BudgetLineItemResponseBody, UpdateBudgetLineItemBody } from "@/lib/project-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string; lineItemId: string };
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<NextResponse<BudgetLineItemResponseBody>> {
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: UpdateBudgetLineItemBody;
  try {
    body = (await req.json()) as UpdateBudgetLineItemBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = updateBudgetLineItem(params.id, params.lineItemId, body);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, lineItem: result.data }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse<{ success: boolean; error?: string }>> {
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const result = deleteBudgetLineItem(params.id, params.lineItemId);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 404 });
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
