/**
 * lib/cost-estimate-store.ts
 * -----------------------------------------------------------------------------
 * Server-only Prisma persistence for Cost Estimates saved to a project (see
 * prisma/schema.prisma's `ProjectCostEstimate` model,
 * lib/cost-estimate-types.ts). Two entry points push data here:
 *   1. The Project Management "Cost Estimate" tab, saving a snapshot directly.
 *   2. The AI Plan Analyzer's "Add to Project" action (see
 *      components/AddToProjectModal.tsx), which — if the user has a computed
 *      Material Estimate open — pushes it here too, linked back to the saved
 *      PlanAnalysis via `sourceAnalysisId`.
 *
 * This file uses the Prisma client and must never be imported into a
 * `"use client"` component. Import it only from Route Handlers
 * (app/api/projects/[id]/cost-estimates/**) and other server-only modules.
 * -----------------------------------------------------------------------------
 */

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type {
  AddCostEstimateToProjectBody,
  CostEstimateDetail,
  CostEstimateSummary,
  UpdateCostEstimateBody,
} from "./cost-estimate-types";
import type { MaterialEstimate, Room, UnitCostSettings } from "./types";

export interface StoreResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function ok<T>(data: T): StoreResult<T> {
  return { success: true, data };
}

function fail<T>(error: string): StoreResult<T> {
  return { success: false, error };
}

function isNotFoundError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2025";
}

// eslint-disable-next-line @typescript-eslint/ban-types -- `{}` is Prisma's documented idiom for "the plain model payload, no include/select"
type CostEstimateRow = Prisma.ProjectCostEstimateGetPayload<{}>;

function toSummary(row: CostEstimateRow): CostEstimateSummary {
  const materialEstimate = row.estimateJson as unknown as MaterialEstimate;
  return {
    id: row.id,
    projectId: row.projectId,
    fileName: row.fileName,
    createdAt: row.createdAt.toISOString(),
    sourceAnalysisId: row.sourceAnalysisId ?? undefined,
    subtotal: materialEstimate.subtotal,
    contingencyAmount: materialEstimate.contingencyAmount,
    total: materialEstimate.total,
    lineItemCount: materialEstimate.lineItems.length,
  };
}

function toDetail(row: CostEstimateRow): CostEstimateDetail {
  return {
    ...toSummary(row),
    materialEstimate: row.estimateJson as unknown as MaterialEstimate,
    settings: row.settingsJson as unknown as UnitCostSettings,
    rooms: (row.roomsJson as unknown as Room[] | null) ?? [],
  };
}

export async function listCostEstimates(projectId: string): Promise<CostEstimateSummary[]> {
  const rows = await prisma.projectCostEstimate.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toSummary);
}

export async function getCostEstimate(projectId: string, id: string): Promise<CostEstimateDetail | null> {
  const row = await prisma.projectCostEstimate.findUnique({ where: { id } });
  if (!row || row.projectId !== projectId) return null;
  return toDetail(row);
}

/** Saves a Cost Estimate to a project — from the PM tab directly, or via "Add to Project". */
export async function createCostEstimate(
  projectId: string,
  body: AddCostEstimateToProjectBody
): Promise<StoreResult<CostEstimateDetail>> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return fail(`Project "${projectId}" not found.`);
  if (!body.fileName?.trim()) return fail("File name is required.");
  if (!body.settings || typeof body.settings !== "object") return fail("Unit cost settings are required.");
  if (!body.materialEstimate || !Array.isArray(body.materialEstimate.lineItems)) {
    return fail("A computed material estimate is required.");
  }

  if (body.sourceAnalysisId) {
    const analysis = await prisma.planAnalysis.findUnique({
      where: { id: body.sourceAnalysisId },
      select: { id: true, projectId: true },
    });
    if (!analysis || analysis.projectId !== projectId) {
      return fail(`Source analysis "${body.sourceAnalysisId}" not found in this project.`);
    }
  }

  const row = await prisma.projectCostEstimate.create({
    data: {
      id: randomUUID(),
      projectId,
      fileName: body.fileName.trim(),
      sourceAnalysisId: body.sourceAnalysisId || undefined,
      settingsJson: body.settings as unknown as Prisma.InputJsonValue,
      estimateJson: body.materialEstimate as unknown as Prisma.InputJsonValue,
      roomsJson: (body.rooms ?? []) as unknown as Prisma.InputJsonValue,
    },
  });

  return ok(toDetail(row));
}

/**
 * Updates a saved Cost Estimate's settings/totals after live edits in the
 * Project Management tab's calculator (see components/pm/CostEstimatesList.tsx).
 * Room geometry (roomsJson) is immutable once saved — only settings and the
 * resulting recomputed MaterialEstimate change.
 */
export async function updateCostEstimate(
  projectId: string,
  id: string,
  body: UpdateCostEstimateBody
): Promise<StoreResult<CostEstimateDetail>> {
  const existing = await prisma.projectCostEstimate.findUnique({ where: { id } });
  if (!existing || existing.projectId !== projectId) return fail(`Cost estimate "${id}" not found.`);
  if (!body.settings || typeof body.settings !== "object") return fail("Unit cost settings are required.");
  if (!body.materialEstimate || !Array.isArray(body.materialEstimate.lineItems)) {
    return fail("A computed material estimate is required.");
  }

  const row = await prisma.projectCostEstimate.update({
    where: { id },
    data: {
      settingsJson: body.settings as unknown as Prisma.InputJsonValue,
      estimateJson: body.materialEstimate as unknown as Prisma.InputJsonValue,
    },
  });

  return ok(toDetail(row));
}

export async function deleteCostEstimate(projectId: string, id: string): Promise<StoreResult<true>> {
  const existing = await prisma.projectCostEstimate.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) return fail(`Cost estimate "${id}" not found.`);
  try {
    await prisma.projectCostEstimate.delete({ where: { id } });
    return ok(true);
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Cost estimate "${id}" not found.`);
    throw err;
  }
}
