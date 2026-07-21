/**
 * app/api/projects/[id]/budget/route.ts
 * -----------------------------------------------------------------------------
 * GET  /api/projects/:id/budget — list phase-by-phase budget line items.
 * POST /api/projects/:id/budget — create a budget line item.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createBudgetLineItem, listBudgetLineItems } from "@/lib/project-store";
import type { BudgetListResponseBody, BudgetLineItemResponseBody, CreateBudgetLineItemBody } from "@/lib/project-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse<BudgetListResponseBody>> {
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }
  return NextResponse.json({ success: true, lineItems: listBudgetLineItems(params.id) }, { status: 200 });
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse<BudgetLineItemResponseBody>> {
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: CreateBudgetLineItemBody;
  try {
    body = (await req.json()) as CreateBudgetLineItemBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = createBudgetLineItem(params.id, body);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, lineItem: result.data }, { status: 201 });
}
