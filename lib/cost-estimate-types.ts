/**
 * lib/cost-estimate-types.ts
 * -----------------------------------------------------------------------------
 * TypeScript schema for Cost Estimates saved to a Project Management project —
 * either created directly from the "Cost Estimate" PM tab, or pushed
 * automatically when the AI Plan Analyzer's "Add to Project" action includes
 * a computed estimate (see components/AddToProjectModal.tsx,
 * lib/cost-estimate-store.ts).
 *
 * Dependency-free (no fs/SDK imports), safe to import into Client Components.
 * Server-only persistence lives in lib/cost-estimate-store.ts.
 * -----------------------------------------------------------------------------
 */

import type { MaterialEstimate, Room, UnitCostSettings } from "./types";

/** Lightweight summary for list views — omits the full line-item breakdown. */
export interface CostEstimateSummary {
  id: string;
  projectId: string;
  /** Label for this estimate — typically the source plan's file name. */
  fileName: string;
  createdAt: string;
  /** Set when this estimate was pushed automatically from a saved Plan Analysis. */
  sourceAnalysisId?: string;
  subtotal: number;
  contingencyAmount: number;
  total: number;
  lineItemCount: number;
}

/** Full detail, including the complete MaterialEstimate and the settings used to produce it. */
export interface CostEstimateDetail extends CostEstimateSummary {
  materialEstimate: MaterialEstimate;
  settings: UnitCostSettings;
  /**
   * Room geometry the estimate was computed from. Present for estimates saved
   * after roomsJson was added to the schema — lets the Project Management
   * tab recompute quantities live with the same components.MaterialEstimator
   * calculator the AI Plan Analyzer uses, instead of a frozen snapshot.
   * Empty for older estimates, which fall back to a read-only view.
   */
  rooms: Room[];
}

/** POST body for saving a cost estimate to a project (from the PM tab or "Add to Project"). */
export interface AddCostEstimateToProjectBody {
  fileName: string;
  sourceAnalysisId?: string;
  settings: UnitCostSettings;
  materialEstimate: MaterialEstimate;
  rooms: Room[];
}

/** PATCH body for updating a saved cost estimate's settings/totals after live edits in the PM tab. */
export interface UpdateCostEstimateBody {
  settings: UnitCostSettings;
  materialEstimate: MaterialEstimate;
}

export interface CostEstimatesListResponseBody {
  success: boolean;
  estimates?: CostEstimateSummary[];
  error?: string;
}

export interface CostEstimateResponseBody {
  success: boolean;
  costEstimate?: CostEstimateDetail;
  error?: string;
}
