/**
 * lib/plan-analysis-types.ts
 * -----------------------------------------------------------------------------
 * TypeScript schema for Plan Analyses saved to a Project Management project
 * via the AI Plan Analyzer's "Add to Project" action (see
 * components/PlanAnalyzerTool.tsx and lib/plan-analysis-store.ts).
 *
 * Dependency-free (no fs/SDK imports), safe to import into Client Components.
 * Server-only persistence lives in lib/plan-analysis-store.ts.
 * -----------------------------------------------------------------------------
 */

import type { Dimension, PlanAnalysisResult, VisionProvider } from "./types";

/** Lightweight summary for list views — omits the full geometry/result payload. */
export interface PlanAnalysisSummary {
  id: string;
  projectId: string;
  fileName: string;
  provider: VisionProvider;
  context?: string;
  createdAt: string;
  /** Set when the auto-generated PDF report is still present in the project's Reference Files library. */
  referenceFileId?: string;
  layoutDescription: string;
  totalRoomCount: number;
  totalArea: Dimension;
}

/** Full detail, including the complete computed PlanAnalysisResult. */
export interface PlanAnalysisDetail extends PlanAnalysisSummary {
  result: PlanAnalysisResult;
}

/** POST body for "Add to Project" — the client sends the full result it already has in memory. */
export interface AddPlanAnalysisToProjectBody {
  fileName: string;
  provider: VisionProvider;
  context?: string;
  result: PlanAnalysisResult;
}

export interface PlanAnalysesListResponseBody {
  success: boolean;
  analyses?: PlanAnalysisSummary[];
  error?: string;
}

export interface PlanAnalysisResponseBody {
  success: boolean;
  analysis?: PlanAnalysisDetail;
  error?: string;
}
