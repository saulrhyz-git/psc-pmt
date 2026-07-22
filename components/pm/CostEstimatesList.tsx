"use client";

/**
 * components/pm/CostEstimatesList.tsx
 * -----------------------------------------------------------------------------
 * Lists Cost Estimates saved to a project — pushed automatically by the AI
 * Plan Analyzer's "Add to Project" action (see components/AddToProjectModal.tsx,
 * lib/cost-estimate-store.ts) when a Material Estimate was computed, or (in a
 * future iteration) added directly from this tab. Clicking one opens a
 * read-only itemized breakdown, mirroring components/MaterialEstimator.tsx's
 * table but without the live-editing controls.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Calculator, Loader2, Sparkles, Trash2, X } from "lucide-react";
import type {
  CostEstimateDetail,
  CostEstimateResponseBody,
  CostEstimateSummary,
  CostEstimatesListResponseBody,
} from "@/lib/cost-estimate-types";
import type { MaterialCategory, MaterialLineItem } from "@/lib/types";
import { formatCurrency } from "@/lib/currency-utils";

const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  paint: "Paint",
  drywall: "Drywall",
  flooring: "Flooring",
  trim: "Trim",
  labor: "Labor",
  other: "Other",
};

const CATEGORY_ORDER: MaterialCategory[] = ["paint", "drywall", "flooring", "trim", "labor", "other"];

const UNIT_LABELS: Record<string, string> = {
  sq_ft: "sq ft",
  sq_m: "sq m",
  linear_ft: "lin ft",
  linear_m: "lin m",
  gallons: "gal",
  liters: "L",
  sheets: "sheets",
  hours: "hrs",
  each: "ea",
};

export default function CostEstimatesList({ projectId }: { projectId: string }) {
  const [estimates, setEstimates] = useState<CostEstimateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchEstimates = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/cost-estimates`);
      const payload = (await res.json()) as CostEstimatesListResponseBody;
      if (!res.ok || !payload.success || !payload.estimates) {
        throw new Error(payload.error || "Failed to load cost estimates.");
      }
      setEstimates(payload.estimates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cost estimates.");
      setEstimates([]);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchEstimates();
  }, [fetchEstimates]);

  async function handleDelete(id: string) {
    setError(null);
    const prev = estimates;
    setEstimates((cur) => (cur ? cur.filter((e) => e.id !== id) : cur));
    try {
      const res = await fetch(`/api/projects/${projectId}/cost-estimates/${id}`, { method: "DELETE" });
      const payload = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !payload.success) throw new Error(payload.error || "Failed to delete cost estimate.");
    } catch (err) {
      setEstimates(prev);
      setError(err instanceof Error ? err.message : "Failed to delete cost estimate.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {estimates === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading cost estimates...
        </div>
      ) : estimates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <Calculator className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No cost estimates saved yet</p>
          <p className="text-xs text-slate-500">
            Run a blueprint through the AI Plan Analyzer, compute a Cost Estimate there, then use &quot;Add to
            Project&quot; to save it here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {estimates.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <button type="button" onClick={() => setSelectedId(e.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <Calculator className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{e.fileName}</p>
                  <p className="truncate text-xs text-slate-500">
                    {e.lineItemCount} line items · {formatCurrency(e.total)} total ·{" "}
                    {new Date(e.createdAt).toLocaleDateString()}
                    {e.sourceAnalysisId && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                        <Sparkles className="h-2.5 w-2.5" />
                        from analysis
                      </span>
                    )}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(e.id)}
                className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                aria-label={`Delete ${e.fileName}`}
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedId && (
        <CostEstimateDetailModal projectId={projectId} estimateId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Detail modal
// -----------------------------------------------------------------------------

function CostEstimateDetailModal({
  projectId,
  estimateId,
  onClose,
}: {
  projectId: string;
  estimateId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CostEstimateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/cost-estimates/${estimateId}`);
        const payload = (await res.json()) as CostEstimateResponseBody;
        if (!res.ok || !payload.success || !payload.costEstimate) {
          throw new Error(payload.error || "Failed to load this cost estimate.");
        }
        if (!cancelled) setDetail(payload.costEstimate);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load this cost estimate.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, estimateId]);

  const groupedByCategory = new Map<MaterialCategory, MaterialLineItem[]>();
  if (detail) {
    for (const item of detail.materialEstimate.lineItems) {
      const list = groupedByCategory.get(item.category) ?? [];
      list.push(item);
      groupedByCategory.set(item.category, list);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose} role="presentation">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{detail?.fileName ?? "Loading..."}</h2>
            {detail && <p className="text-xs text-slate-500">{new Date(detail.createdAt).toLocaleString()}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!detail && !error && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading cost estimate...
            </div>
          )}

          {detail && (
            <>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 border-b border-slate-200 bg-slate-50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>Item</span>
                <span className="w-24 text-right">Quantity</span>
                <span className="w-20 text-right">Unit Cost</span>
                <span className="w-24 text-right">Total</span>
              </div>

              {CATEGORY_ORDER.filter((cat) => groupedByCategory.has(cat)).map((category) => (
                <div key={category}>
                  <div className="bg-slate-100 px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {CATEGORY_LABELS[category]}
                  </div>
                  <table className="w-full text-left text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {groupedByCategory.get(category)!.map((item) => (
                        <tr key={item.id}>
                          <td className="w-1/2 px-5 py-2 text-slate-700">{item.label}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                            {item.quantity} {UNIT_LABELS[item.unit] ?? item.unit}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-slate-500">{formatCurrency(item.unitCost)}</td>
                          <td className="px-5 py-2 text-right tabular-nums font-medium text-slate-800">
                            {formatCurrency(item.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              <div className="space-y-1 border-t border-slate-200 bg-slate-50 px-5 py-3 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(detail.materialEstimate.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Contingency ({(detail.materialEstimate.contingencyPercent * 100).toFixed(0)}%)</span>
                  <span className="tabular-nums">{formatCurrency(detail.materialEstimate.contingencyAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-slate-900">
                  <span>Total Estimate</span>
                  <span className="tabular-nums">{formatCurrency(detail.materialEstimate.total)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
