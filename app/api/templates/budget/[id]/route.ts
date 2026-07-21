/**
 * app/api/templates/budget/[id]/route.ts
 * -----------------------------------------------------------------------------
 * PATCH  /api/templates/budget/:id — update a budget template.
 * DELETE /api/templates/budget/:id — remove a budget template.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteBudgetTemplate, updateBudgetTemplate } from "@/lib/template-store";
import type { BudgetTemplateResponseBody, UpdateBudgetTemplateBody } from "@/lib/template-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string };
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<NextResponse<BudgetTemplateResponseBody>> {
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: UpdateBudgetTemplateBody;
  try {
    body = (await req.json()) as UpdateBudgetTemplateBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const result = updateBudgetTemplate(params.id, body);
  if (!result.success || !result.data) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true, template: result.data }, { status: 200 });
}

export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse<{ success: boolean; error?: string }>> {
  if (!requireSession(req)) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const result = deleteBudgetTemplate(params.id);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 404 });
  }
  return NextResponse.json({ success: true }, { status: 200 });
}
