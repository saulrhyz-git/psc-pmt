"use client";

/**
 * components/AddToProjectModal.tsx
 * -----------------------------------------------------------------------------
 * "Add to Project" flow for the AI Plan Analyzer. Lets the user pick one of
 * their Project Management projects and saves the current PlanAnalysisResult
 * to it via POST /api/projects/:id/plan-analyses. That endpoint also
 * generates a PDF report and drops it into the project's Reference Files
 * library (see lib/plan-analysis-store.ts).
 *
 * If a computed Cost Estimate is available (from components/PlanAnalyzerTool.tsx
 * — whatever's currently shown in the Cost Estimate tab, admin defaults or
 * user-tweaked), this also pushes it to the project's Cost Estimates via a
 * second POST to /api/projects/:id/cost-estimates, linked back to the saved
 * analysis via sourceAnalysisId (see lib/cost-estimate-store.ts). That second
 * call is best-effort: if it fails, the analysis + PDF are still saved and we
 * just surface a softer warning rather than failing the whole flow.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, FolderPlus, Loader2, X } from "lucide-react";
import type { Project, ProjectsListResponseBody } from "@/lib/project-types";
import type { AddPlanAnalysisToProjectBody, PlanAnalysisResponseBody } from "@/lib/plan-analysis-types";
import type { AddCostEstimateToProjectBody, CostEstimateResponseBody } from "@/lib/cost-estimate-types";
import type { MaterialEstimate, PlanAnalysisResult, UnitCostSettings } from "@/lib/types";

interface AddToProjectModalProps {
  open: boolean;
  onClose: () => void;
  result: PlanAnalysisResult;
  context?: string;
  /** Whatever's currently computed in the Cost Estimate tab, if any — pushed to the project alongside the analysis. */
  costEstimate: { settings: UnitCostSettings; materialEstimate: MaterialEstimate } | null;
}

export default function AddToProjectModal({ open, onClose, result, context, costEstimate }: AddToProjectModalProps) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedProjectName, setSavedProjectName] = useState<string | null>(null);
  const [costEstimateSaved, setCostEstimateSaved] = useState(false);
  const [costEstimateWarning, setCostEstimateWarning] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    setError(null);
    try {
      const res = await fetch("/api/projects");
      const payload = (await res.json()) as ProjectsListResponseBody;
      if (!res.ok || !payload.success || !payload.projects) {
        throw new Error(payload.error || "Failed to load projects.");
      }
      setProjects(payload.projects);
      setSelectedProjectId((prev) => prev || payload.projects![0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects.");
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSavedProjectName(null);
      setError(null);
      setCostEstimateSaved(false);
      setCostEstimateWarning(null);
      void fetchProjects();
    }
  }, [open, fetchProjects]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedProjectId) return;
    setSaving(true);
    setError(null);

    try {
      const body: AddPlanAnalysisToProjectBody = {
        fileName: result.sourceFileName,
        provider: result.provider,
        context: context?.trim() || undefined,
        result,
      };
      const res = await fetch(`/api/projects/${selectedProjectId}/plan-analyses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as PlanAnalysisResponseBody;
      if (!res.ok || !payload.success || !payload.analysis) {
        throw new Error(payload.error || "Failed to add this analysis to the project.");
      }
      const project = projects?.find((p) => p.id === selectedProjectId);
      setSavedProjectName(project?.name ?? "the project");

      // Best-effort: push the currently computed Cost Estimate too, linked
      // back to the analysis we just saved. A failure here shouldn't undo or
      // block the successful analysis save above — just surface a warning.
      if (costEstimate && costEstimate.materialEstimate.lineItems.length > 0) {
        try {
          const costBody: AddCostEstimateToProjectBody = {
            fileName: result.sourceFileName,
            sourceAnalysisId: payload.analysis.id,
            settings: costEstimate.settings,
            materialEstimate: costEstimate.materialEstimate,
          };
          const costRes = await fetch(`/api/projects/${selectedProjectId}/cost-estimates`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(costBody),
          });
          const costPayload = (await costRes.json()) as CostEstimateResponseBody;
          if (!costRes.ok || !costPayload.success) {
            throw new Error(costPayload.error || "Failed to save the cost estimate.");
          }
          setCostEstimateSaved(true);
        } catch (err) {
          setCostEstimateWarning(
            err instanceof Error ? err.message : "The analysis was saved, but the cost estimate could not be."
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add this analysis to the project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-project-title"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="add-to-project-title" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <FolderPlus className="h-4 w-4 text-indigo-600" />
            Add to Project
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {savedProjectName ? (
          <div className="flex flex-col gap-4 px-5 py-6">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Added to <strong>{savedProjectName}</strong>. A PDF report of this analysis was also saved to that
                project&apos;s Reference Files library
                {costEstimateSaved && " and the computed cost estimate was saved to its Cost Estimates"} — view from
                the Project Management tab.
              </span>
            </div>
            {costEstimateWarning && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{costEstimateWarning}</span>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="self-end rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
            <p className="text-xs text-slate-500">
              Save this analysis (<span className="font-medium text-slate-700">{result.sourceFileName}</span>) to a
              project. It will appear under that project&apos;s Plan Analyses, a PDF summary will be added to its
              Reference Files
              {costEstimate && costEstimate.materialEstimate.lineItems.length > 0
                ? ", and the current Cost Estimate will be saved to its Cost Estimates."
                : "."}
            </p>

            {loadingProjects ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading projects...
              </div>
            ) : projects && projects.length > 0 ? (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500">Project</span>
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full appearance-none rounded-md border border-slate-200 bg-white px-3 py-2 pr-8 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </label>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                No projects yet. Create one from the Project Management tab first, then come back here.
              </p>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !selectedProjectId || loadingProjects}
                className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Add to Project
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
