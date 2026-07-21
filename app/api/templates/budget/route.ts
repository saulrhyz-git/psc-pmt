/**
 * app/api/templates/budget/route.ts
 * -----------------------------------------------------------------------------
 * GET  /api/templates/budget — list all budget templates.
 * POST /api/templates/budget — create a budget template.
 *
 * Access: any signed-in user, same as Project Management (see
 * lib/template-types.ts's header comment).
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createBudgetTemplate, listBudgetTemplates } from "@/lib/template-store";
import type { BudgetTemplateResponseBody, BudgetTemplatesListResponseBody, CreateBudgetTemplateBody } from "@/lib/template-types";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse<BudgetTemplatesListResponseBody>> {
  try {
    if (!(await requireSession(req))) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }
    return NextResponse.json({ success: true, templates: await listBudgetTemplates() }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/templates/budget] GET failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load budget templates. (Is the database reachable and migrated?)" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<BudgetTemplateResponseBody>> {
  try {
    if (!(await requireSession(req))) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }

    let body: CreateBudgetTemplateBody;
    try {
      body = (await req.json()) as CreateBudgetTemplateBody;
    } catch {
      return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
    }

    const result = await createBudgetTemplate(body);
    if (!result.success || !result.data) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, template: result.data }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/templates/budget] POST failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to create budget template. (Is the database reachable and migrated?)" },
      { status: 500 }
    );
  }
}
