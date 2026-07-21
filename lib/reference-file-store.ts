/**
 * lib/reference-file-store.ts
 * -----------------------------------------------------------------------------
 * Server-only Prisma persistence for each project's Reference Files library
 * (see prisma/schema.prisma's `ReferenceFile` model and
 * lib/reference-file-types.ts). Files are stored as raw bytes directly in
 * Postgres (bytea) — consistent with the rest of the app's "everything in
 * Postgres, no separate file storage" architecture.
 *
 * Listing never selects the `data` column (avoids pulling potentially large
 * blobs just to render a file list) — only `getReferenceFileWithData` does,
 * for the download route.
 *
 * This file uses the Prisma client and must never be imported into a
 * `"use client"` component. Import it only from Route Handlers
 * (app/api/projects/[id]/reference-files/**) and other server-only modules.
 * -----------------------------------------------------------------------------
 */

import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import type { ReferenceFileMeta, UploadReferenceFileBody } from "./reference-file-types";

/** Same cap as the Plan Analyzer's upload limit (see app/api/analyze/route.ts). */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

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

interface ReferenceFileMetaRow {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  description: string | null;
  sourceAnalysisId: string | null;
  createdAt: Date;
}

function toMeta(row: ReferenceFileMetaRow): ReferenceFileMeta {
  return {
    id: row.id,
    projectId: row.projectId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    description: row.description ?? undefined,
    sourceAnalysisId: row.sourceAnalysisId ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

const META_SELECT = {
  id: true,
  projectId: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  description: true,
  sourceAnalysisId: true,
  createdAt: true,
} as const;

export async function listReferenceFiles(projectId: string): Promise<ReferenceFileMeta[]> {
  const rows = await prisma.referenceFile.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: META_SELECT,
  });
  return rows.map(toMeta);
}

/** For the download route — includes raw bytes, so only call this when actually serving a file. */
export async function getReferenceFileWithData(
  projectId: string,
  id: string
): Promise<{ meta: ReferenceFileMeta; data: Buffer } | null> {
  const row = await prisma.referenceFile.findUnique({ where: { id } });
  if (!row || row.projectId !== projectId) return null;
  return { meta: toMeta(row), data: Buffer.from(row.data) };
}

export async function createReferenceFile(
  projectId: string,
  body: UploadReferenceFileBody
): Promise<StoreResult<ReferenceFileMeta>> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return fail(`Project "${projectId}" not found.`);
  if (!body.fileName?.trim()) return fail("File name is required.");
  if (!body.mimeType?.trim()) return fail("File type is required.");
  if (!body.fileBase64) return fail("File data is required.");

  let buffer: Buffer;
  try {
    buffer = Buffer.from(body.fileBase64, "base64");
  } catch {
    return fail("File data is not valid base64.");
  }
  if (buffer.length === 0) return fail("File is empty.");
  if (buffer.length > MAX_FILE_BYTES) {
    return fail(`File is too large. Max upload size is ${MAX_FILE_BYTES / (1024 * 1024)}MB.`);
  }

  const row = await prisma.referenceFile.create({
    data: {
      id: randomUUID(),
      projectId,
      fileName: body.fileName.trim(),
      mimeType: body.mimeType.trim(),
      fileSize: buffer.length,
      description: body.description?.trim() || undefined,
      data: buffer,
    },
    select: META_SELECT,
  });
  return ok(toMeta(row));
}

export async function deleteReferenceFile(projectId: string, id: string): Promise<StoreResult<true>> {
  const existing = await prisma.referenceFile.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) return fail(`Reference file "${id}" not found.`);
  try {
    await prisma.referenceFile.delete({ where: { id } });
    return ok(true);
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Reference file "${id}" not found.`);
    throw err;
  }
}
