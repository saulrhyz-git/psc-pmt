/**
 * app/api/projects/[id]/export/route.ts
 * -----------------------------------------------------------------------------
 * GET /api/projects/:id/export — one-click Excel export of everything for a
 * project: project info, tasks, budget breakdown, crew, and equipment, each
 * as its own worksheet. Built with SheetJS (`xlsx` on npm, Apache-2.0 — a
 * permissive license, unlike the AGPL note on `mupdf` used for Tool #1's PDF
 * rasterization).
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireSession } from "@/lib/auth";
import { getProjectBundle } from "@/lib/project-store";
import { computeProjectKpis } from "@/lib/project-kpi-utils";
import { CURRENCY_SYMBOL } from "@/lib/currency-utils";

export const runtime = "nodejs";

interface RouteParams {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!(await requireSession(req))) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const bundle = await getProjectBundle(params.id);
  if (!bundle) {
    return NextResponse.json({ success: false, error: `Project "${params.id}" not found.` }, { status: 404 });
  }

  const { project, tasks, budgetLineItems, crew, equipment } = bundle;
  const kpis = computeProjectKpis(bundle);

  const workbook = XLSX.utils.book_new();

  const overviewSheet = XLSX.utils.aoa_to_sheet([
    ["Project Overview"],
    [`All monetary values in Philippine Peso (${CURRENCY_SYMBOL})`],
    [],
    ["Name", project.name],
    ["Project In Charge", project.projectInCharge],
    ["Client Name", project.clientName],
    ["Status", project.status],
    ["Project Type", project.projectType ?? ""],
    ["Address", project.address ?? ""],
    ["Date Started", project.dateStarted],
    ["Target Completion", project.targetCompletionDate ?? ""],
    [`Total Budget (${CURRENCY_SYMBOL})`, project.totalBudget],
    ["Notes", project.notes ?? ""],
    [],
    ["KPIs"],
    ["Active Tasks", kpis.activeTaskCount],
    ["Overall Progress (%)", kpis.overallProgressPercent],
    [`Total Budgeted (${CURRENCY_SYMBOL})`, kpis.totalBudgeted],
    [`Total Spent (${CURRENCY_SYMBOL})`, kpis.totalSpent],
    ["Budget Burn (%)", kpis.budgetBurnPercent],
    ["Active Crew Count", kpis.crewCount],
  ]);
  XLSX.utils.book_append_sheet(workbook, overviewSheet, "Overview");

  const tasksSheet = XLSX.utils.json_to_sheet(
    tasks.map((t) => ({
      Title: t.title,
      Phase: t.phase,
      Status: t.status,
      "Progress %": t.progressPercent,
      Priority: t.priority,
      Assignee: t.assignee ?? "",
      "Start Date": t.startDate,
      "End Date": t.endDate,
      Description: t.description ?? "",
    }))
  );
  XLSX.utils.book_append_sheet(workbook, tasksSheet, "Tasks");

  const budgetSheet = XLSX.utils.json_to_sheet(
    budgetLineItems.map((b) => ({
      Phase: b.phase,
      Category: b.category,
      Description: b.description ?? "",
      [`Budgeted (${CURRENCY_SYMBOL})`]: b.budgeted,
      [`Spent (${CURRENCY_SYMBOL})`]: b.spent,
      [`Remaining (${CURRENCY_SYMBOL})`]: b.budgeted - b.spent,
    }))
  );
  XLSX.utils.book_append_sheet(workbook, budgetSheet, "Budget");

  const crewSheet = XLSX.utils.json_to_sheet(
    crew.map((c) => ({
      Name: c.name,
      Role: c.role,
      "Allocation %": c.allocationPercent,
      Status: c.status,
      Notes: c.notes ?? "",
    }))
  );
  XLSX.utils.book_append_sheet(workbook, crewSheet, "Crew");

  const equipmentSheet = XLSX.utils.json_to_sheet(
    equipment.map((e) => ({
      Name: e.name,
      Type: e.equipmentType,
      Status: e.status,
      "Assigned To": e.assignedTo ?? "",
      Notes: e.notes ?? "",
    }))
  );
  XLSX.utils.book_append_sheet(workbook, equipmentSheet, "Equipment");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  // Node's Buffer type is backed by `ArrayBufferLike` (which includes
  // SharedArrayBuffer), while DOM's BlobPart/BodyInit types require a
  // concrete ArrayBuffer — a known TS lib mismatch. `Uint8Array.from` copies
  // into a fresh, plain-ArrayBuffer-backed typed array to satisfy it.
  const body = new Blob([Uint8Array.from(buffer)]);
  const safeFileName = project.name.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "project";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeFileName}_export.xlsx"`,
    },
  });
}
