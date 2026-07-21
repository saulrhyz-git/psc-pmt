/**
 * lib/reference-file-types.ts
 * -----------------------------------------------------------------------------
 * TypeScript schema for each Project Management project's Reference Files
 * library — a small per-project document store (spec sheets, codes, notes,
 * and PDF snapshots auto-generated from the AI Plan Analyzer's "Add to
 * Project" action — see lib/plan-analysis-types.ts).
 *
 * Dependency-free (no fs/SDK imports), safe to import into Client Components.
 * Server-only persistence lives in lib/reference-file-store.ts.
 * -----------------------------------------------------------------------------
 */

/** Metadata only — never includes the raw file bytes (see ReferenceFileDownload for that). */
export interface ReferenceFileMeta {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  /** Size in bytes. */
  fileSize: number;
  description?: string;
  /** Set if this file was auto-generated from a saved Plan Analysis's PDF report. */
  sourceAnalysisId?: string;
  createdAt: string;
}

export interface UploadReferenceFileBody {
  fileName: string;
  mimeType: string;
  description?: string;
  /** Base64-encoded raw file bytes (no data: URL prefix). */
  fileBase64: string;
}

export interface ReferenceFilesListResponseBody {
  success: boolean;
  files?: ReferenceFileMeta[];
  error?: string;
}

export interface ReferenceFileResponseBody {
  success: boolean;
  file?: ReferenceFileMeta;
  error?: string;
}
