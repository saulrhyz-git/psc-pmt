"use client";

/**
 * components/pm/PlanAnalysesList.tsx
 * -----------------------------------------------------------------------------
 * Lists Plan Analyses saved to a project via the AI Plan Analyzer's "Add to
 * Project" action (see components/AddToProjectModal.tsx,
 * lib/plan-analysis-store.ts). Clicking one opens a detail view reusing the
 * same room breakdown / redrawn plan / furniture components as the Plan
 * Analyzer tab itself, since it's the same PlanAnalysisResult shape.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Building2, ClipboardList, Download, Loader2, Ruler, Sparkles, Trash2, X } from "lucide-react";
import type {
  PlanAnalysisDetail,
  PlanAnalysesListResponseBody,
  PlanAnalysisResponseBody,
  PlanAnalysisSummary,
} from "@/lib/plan-analysis-types";
import { formatDimension } from "@/lib/measurement-utils";
import { VISION_PROVIDERS } from "@/lib/vision-provider-metadata";
import SVGPlanRenderer from "@/components/SVGPlanRenderer";
import RoomBreakdownTable from "@/components/RoomBreakdownTable";
import FurnitureOverlay from "@/components/FurnitureOverlay";

export default function PlanAnalysesList({ projectId }: { projectId: string }) {
  const [analyses, setAnalyses] = useState<PlanAnalysisSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchAnalyses = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/plan-analyses`);
      const payload = (await res.json()) as PlanAnalysesListResponseBody;
      if (!res.ok || !payload.success || !payload.analyses) {
        throw new Error(payload.error || "Failed to load plan analyses.");
      }
      setAnalyses(payload.analyses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plan analyses.");
      setAnalyses([]);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchAnalyses();
  }, [fetchAnalyses]);

  async function handleDelete(id: string) {
    setError(null);
    const prev = analyses;
    setAnalyses((cur) => (cur ? cur.filter((a) => a.id !== id) : cur));
    try {
      const res = await fetch(`/api/projects/${projectId}/plan-analyses/${id}`, { method: "DELETE" });
      const payload = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !payload.success) throw new Error(payload.error || "Failed to delete analysis.");
    } catch (err) {
      setAnalyses(prev);
      setError(err instanceof Error ? err.message : "Failed to delete analysis.");
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

      {analyses === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading plan analyses...
        </div>
      ) : analyses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <ClipboardList className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">No plan analyses saved yet</p>
          <p className="text-xs text-slate-500">
            Run a blueprint through the AI Plan Analyzer tab, then use &quot;Add to Project&quot; to save it here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {analyses.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
            >
              <button type="button" onClick={() => setSelectedId(a.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{a.fileName}</p>
                  <p className="truncate text-xs text-slate-500">
                    {VISION_PROVIDERS[a.provider].label} · {a.totalRoomCount} rooms ·{" "}
                    {formatDimension(a.totalArea, { asArea: true })} · {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {a.referenceFileId && (
                  <a
                    href={`/api/projects/${projectId}/reference-files/${a.referenceFileId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Download PDF report"
                    title="Download PDF report"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete ${a.fileName}`}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedId && (
        <PlanAnalysisDetailModal projectId={projectId} analysisId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Detail modal
// -----------------------------------------------------------------------------

function PlanAnalysisDetailModal({
  projectId,
  analysisId,
  onClose,
}: {
  projectId: string;
  analysisId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<PlanAnalysisDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [visibleFurnitureIds, setVisibleFurnitureIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/plan-analyses/${analysisId}`);
        const payload = (await res.json()) as PlanAnalysisResponseBody;
        if (!res.ok || !payload.success || !payload.analysis) {
          throw new Error(payload.error || "Failed to load this analysis.");
        }
        if (cancelled) return;
        setDetail(payload.analysis);
        setVisibleFurnitureIds(new Set(payload.analysis.result.furnitureSuggestions.map((f) => f.id)));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load this analysis.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, analysisId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose} role="presentation">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{detail?.fileName ?? "Loading..."}</h2>
            {detail && (
              <p className="text-xs text-slate-500">
                {VISION_PROVIDERS[detail.provider].label} · {new Date(detail.createdAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {detail?.referenceFileId && (
              <a
                href={`/api/projects/${projectId}/reference-files/${detail.referenceFileId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                PDF report
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!detail && !error && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading analysis...
            </div>
          )}

          {detail && (
            <div className="flex flex-col gap-5">
              {detail.context && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-700">
                  <span className="font-semibold">Context provided: </span>
                  {detail.context}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Ruler className="h-3.5 w-3.5 text-indigo-600" />
                  {formatDimension(detail.result.metadata.totalArea, { asArea: true })}
                </span>
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                  {detail.result.metadata.totalRoomCount} rooms
                </span>
                <span>Stories: {detail.result.metadata.stories}</span>
                <span>Confidence: {Math.round(detail.result.overallConfidence * 100)}%</span>
              </div>

              <p className="text-sm leading-relaxed text-slate-600">{detail.result.metadata.layoutDescription}</p>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
                <div className="flex flex-col gap-4">
                  <div className="h-[360px] overflow-hidden rounded-xl border border-slate-200">
                    <SVGPlanRenderer
                      data={detail.result.svgVectorData}
                      selectedRoomId={selectedRoomId}
                      onSelectRoom={setSelectedRoomId}
                      furnitureSuggestions={detail.result.furnitureSuggestions}
                      visibleFurnitureIds={visibleFurnitureIds}
                      className="h-full border-0"
                    />
                  </div>
                  <RoomBreakdownTable
                    rooms={detail.result.rooms}
                    spacePlanningComments={detail.result.spacePlanningComments}
                    selectedRoomId={selectedRoomId}
                    onSelectRoom={setSelectedRoomId}
                  />
                </div>
                <FurnitureOverlay
                  rooms={detail.result.rooms}
                  suggestions={detail.result.furnitureSuggestions}
                  visibleFurnitureIds={visibleFurnitureIds}
                  onChangeVisibleFurnitureIds={setVisibleFurnitureIds}
                />
              </div>

              {detail.result.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                  <p className="mb-1 font-semibold">Warnings</p>
                  <ul className="list-inside list-disc space-y-0.5">
                    {detail.result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
