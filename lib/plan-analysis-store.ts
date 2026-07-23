/**
 * lib/plan-analysis-store.ts
 * -----------------------------------------------------------------------------
 * Server-only Prisma persistence for Plan Analyses saved to a project via the
 * AI Plan Analyzer's "Add to Project" action (see
 * prisma/schema.prisma's `PlanAnalysis` model, lib/plan-analysis-types.ts).
 *
 * `createPlanAnalysis` does two things atomically inside one transaction:
 *   1. persists the full computed PlanAnalysisResult as a PlanAnalysis row
 *      (viewable later from the Project Management tab), and
 *   2. renders a PDF report of that analysis (lib/plan-analysis-pdf.ts) and
 *      drops it into the same project's Reference Files library, linked back
 *      via ReferenceFile.sourceAnalysisId.
 * PDF generation itself happens outside the transaction (pure computation,
 * no DB access) so the transaction only wraps the two actual writes.
 *
 * This file uses the Prisma client and must never be imported into a
 * `"use client"` component. Import it only from Route Handlers
 * (app/api/projects/[id]/plan-analyses/**) and other server-only modules.
 * -----------------------------------------------------------------------------
 */

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { buildPlanAnalysisPdf } from "./plan-analysis-pdf";
import type { AddPlanAnalysisToProjectBody, PlanAnalysisDetail, PlanAnalysisSummary } from "./plan-analysis-types";
import type { PlanAnalysisResult } from "./types";

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

type PlanAnalysisRow = Prisma.PlanAnalysisGetPayload<{ include: { referenceFile: { select: { id: true } } } }>;

function toSummary(row: PlanAnalysisRow): PlanAnalysisSummary {
  const result = row.resultJson as unknown as PlanAnalysisResult;
  return {
    id: row.id,
    projectId: row.projectId,
    fileName: row.fileName,
    provider: row.provider,
    context: row.context ?? undefined,
    createdAt: row.createdAt.toISOString(),
    referenceFileId: row.referenceFile?.id ?? undefined,
    layoutDescription: result.metadata.layoutDescription,
    totalRoomCount: result.metadata.totalRoomCount,
    totalArea: result.metadata.totalArea,
  };
}

function toDetail(row: PlanAnalysisRow): PlanAnalysisDetail {
  return {
    ...toSummary(row),
    result: row.resultJson as unknown as PlanAnalysisResult,
  };
}

const WITH_REFERENCE_FILE = { referenceFile: { select: { id: true } } } as const;

export async function listPlanAnalyses(projectId: string): Promise<PlanAnalysisSummary[]> {
  const rows = await prisma.planAnalysis.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: WITH_REFERENCE_FILE,
  });
  return rows.map(toSummary);
}

export async function getPlanAnalysis(projectId: string, id: string): Promise<PlanAnalysisDetail | null> {
  const row = await prisma.planAnalysis.findUnique({ where: { id }, include: WITH_REFERENCE_FILE });
  if (!row || row.projectId !== projectId) return null;
  return toDetail(row);
}

/**
 * "Add to Project" — validates, generates the PDF report, then writes both
 * the PlanAnalysis row and its linked ReferenceFile in one transaction.
 */
export async function createPlanAnalysis(
  projectId: string,
  projectName: string,
  body: AddPlanAnalysisToProjectBody
): Promise<StoreResult<PlanAnalysisDetail>> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return fail(`Project "${projectId}" not found.`);
  if (!body.fileName?.trim()) return fail("File name is required.");
  if (body.provider !== "claude" && body.provider !== "gemini" && body.provider !== "kimi")
    return fail("A valid provider (claude, gemini, or kimi) is required.");
  if (!body.result || typeof body.result !== "object") return fail("Analysis result is required.");

  const now = new Date();
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await buildPlanAnalysisPdf({
      projectName,
      fileName: body.fileName,
      provider: body.provider,
      context: body.context,
      createdAt: now.toISOString(),
      result: body.result,
    });
  } catch (err) {
    return fail(`Failed to generate the PDF report: ${err instanceof Error ? err.message : String(err)}`);
  }

  const analysisId = randomUUID();
  const pdfFileName = buildPdfFileName(body.fileName);

  const row = await prisma.$transaction(async (tx) => {
    const analysis = await tx.planAnalysis.create({
      data: {
        id: analysisId,
        projectId,
        fileName: body.fileName.trim(),
        provider: body.provider,
        context: body.context?.trim() || undefined,
        resultJson: body.result as unknown as Prisma.InputJsonValue,
        createdAt: now,
      },
    });

    await tx.referenceFile.create({
      data: {
        id: randomUUID(),
        projectId,
        fileName: pdfFileName,
        mimeType: "application/pdf",
        fileSize: pdfBuffer.length,
        description: `Auto-generated report from the AI Plan Analyzer (source: ${body.fileName.trim()})`,
        data: pdfBuffer,
        sourceAnalysisId: analysis.id,
      },
    });

    return tx.planAnalysis.findUniqueOrThrow({ where: { id: analysis.id }, include: WITH_REFERENCE_FILE });
  });

  return ok(toDetail(row));
}

export async function deletePlanAnalysis(projectId: string, id: string): Promise<StoreResult<true>> {
  const existing = await prisma.planAnalysis.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) return fail(`Plan analysis "${id}" not found.`);
  try {
    await prisma.planAnalysis.delete({ where: { id } });
    return ok(true);
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Plan analysis "${id}" not found.`);
    throw err;
  }
}

function buildPdfFileName(sourceFileName: string): string {
  const base = sourceFileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "plan-analysis";
  return `${base}_analysis_report.pdf`;
}
