/**
 * app/api/projects/[id]/budget/apply-template/route.ts
 * -----------------------------------------------------------------------------
 * POST /api/projects/:id/budget/apply-template — bulk-instantiate a saved
 * Budget template's line items into this project's budget (`spent` always
 * starts at 0 for a freshly-applied template, even if the project already
 * has other line items — this adds to the existing budget rather than
 * replacing it, so applying a template twice, or on top of manually-added
 * items, is additive and non-destructive).
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createBudgetLineItem, listBudgetLineItems } from "@/lib/project-store";
import { getBudgetTemplate } from "@/lib/template-store";
import type { BudgetListResponseBody } from "@/lib/project-types";
import type { ApplyBudgetTemplateBody } from "@/lib/template-types";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string };
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<NextResponse<BudgetListResponseBody>> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: ApplyBudgetTemplateBody;
  try {
    body = (await req.json()) as ApplyBudgetTemplateBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body?.templateId) {
    return NextResponse.json({ success: false, error: "templateId is required." }, { status: 400 });
  }

  const template = await getBudgetTemplate(body.templateId);
  if (!template) {
    return NextResponse.json({ success: false, error: `Template "${body.templateId}" not found.` }, { status: 404 });
  }

  for (const lineItem of template.lineItems) {
    const result = await createBudgetLineItem(params.id, {
      phase: lineItem.phase,
      category: lineItem.category,
      description: lineItem.description,
      budgeted: lineItem.budgeted,
      spent: 0,
    });
    if (!result.success) {
      // Most likely cause: the project itself doesn't exist. Individual
      // line-item validation errors shouldn't happen since the template was
      // already validated on save.
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true, lineItems: await listBudgetLineItems(params.id) }, { status: 201 });
}
