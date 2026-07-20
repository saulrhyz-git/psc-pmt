"use client";

/**
 * app/page.tsx
 * -----------------------------------------------------------------------------
 * Tool #1: AI Architectural Plan Analyzer & Redrawer — main dashboard.
 *
 * Flow:
 *   1. User drags/drops or browses for a blueprint (UploadZone).
 *   2. User optionally supplies a known scale hint, then clicks "Analyze Plan".
 *   3. The file is base64-encoded client-side and POSTed to /api/analyze.
 *   4. On success, the full PlanAnalysisResult drives every downstream panel:
 *      PlanViewer (original vs. redrawn SVG), RoomBreakdownTable,
 *      FurnitureOverlay controls, and MaterialEstimator.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Compass,
  Layers,
  Loader2,
  Ruler,
  Sofa,
  Sparkles,
  Table2,
  Wallet,
} from "lucide-react";
import UploadZone from "@/components/UploadZone";
import PlanViewer from "@/components/PlanViewer";
import RoomBreakdownTable from "@/components/RoomBreakdownTable";
import FurnitureOverlay from "@/components/FurnitureOverlay";
import MaterialEstimator from "@/components/MaterialEstimator";
import type { AnalysisStatus, AnalyzeResponseBody, PlanAnalysisResult, UploadedFileState } from "@/lib/types";
import { formatDimension } from "@/lib/measurement-utils";

type TabKey = "breakdown" | "furniture" | "estimate";

const TABS: { key: TabKey; label: string; icon: typeof Table2 }[] = [
  { key: "breakdown", label: "Room Breakdown", icon: Table2 },
  { key: "furniture", label: "Furniture", icon: Sofa },
  { key: "estimate", label: "Cost Estimate", icon: Wallet },
];

export default function PlanAnalyzerPage() {
  const [uploadedFile, setUploadedFile] = useState<UploadedFileState | null>(null);
  const [knownScale, setKnownScale] = useState("");
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [result, setResult] = useState<PlanAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [visibleFurnitureIds, setVisibleFurnitureIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabKey>("breakdown");

  const handleFileSelected = useCallback((fileState: UploadedFileState) => {
    setUploadedFile(fileState);
    setResult(null);
    setError(null);
    setStatus("idle");
    setSelectedRoomId(null);
  }, []);

  const handleClear = useCallback(() => {
    if (uploadedFile) URL.revokeObjectURL(uploadedFile.previewUrl);
    setUploadedFile(null);
    setResult(null);
    setError(null);
    setStatus("idle");
    setSelectedRoomId(null);
    setVisibleFurnitureIds(new Set());
  }, [uploadedFile]);

  const runAnalysis = useCallback(async () => {
    if (!uploadedFile) return;
    setStatus("analyzing");
    setError(null);

    try {
      const fileBase64 = await fileToBase64(uploadedFile.file);

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64,
          fileName: uploadedFile.file.name,
          mimeType: uploadedFile.mimeType,
          knownScale: knownScale.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as AnalyzeResponseBody;

      if (!response.ok || !payload.success || !payload.result) {
        throw new Error(payload.error || `Analysis failed with status ${response.status}.`);
      }

      setResult(payload.result);
      setVisibleFurnitureIds(new Set(payload.result.furnitureSuggestions.map((f) => f.id)));
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred while analyzing the plan.");
      setStatus("error");
    }
  }, [uploadedFile, knownScale]);

  const criticalCommentCount = useMemo(
    () => result?.spacePlanningComments.filter((c) => c.severity === "critical" || c.severity === "warning").length ?? 0,
    [result]
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <Header />

      {!result ? (
        <UploadPanel
          uploadedFile={uploadedFile}
          onFileSelected={handleFileSelected}
          onClear={handleClear}
          isAnalyzing={status === "analyzing"}
          knownScale={knownScale}
          onKnownScaleChange={setKnownScale}
          onAnalyze={runAnalysis}
          error={error}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <ResultSummaryBar result={result} onStartOver={handleClear} criticalCount={criticalCommentCount} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
            <div className="flex flex-col gap-6">
              <PlanViewer
                originalFile={uploadedFile!}
                svgVectorData={result.svgVectorData}
                selectedRoomId={selectedRoomId}
                onSelectRoom={setSelectedRoomId}
                furnitureSuggestions={result.furnitureSuggestions}
                visibleFurnitureIds={visibleFurnitureIds}
              />

              <div>
                <div className="mb-2 flex gap-1 border-b border-slate-200">
                  {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveTab(key)}
                      className={[
                        "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                        activeTab === key
                          ? "border-indigo-600 text-indigo-700"
                          : "border-transparent text-slate-500 hover:text-slate-700",
                      ].join(" ")}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>

                {activeTab === "breakdown" && (
                  <RoomBreakdownTable
                    rooms={result.rooms}
                    spacePlanningComments={result.spacePlanningComments}
                    selectedRoomId={selectedRoomId}
                    onSelectRoom={setSelectedRoomId}
                  />
                )}
                {activeTab === "furniture" && (
                  <FurnitureOverlay
                    rooms={result.rooms}
                    suggestions={result.furnitureSuggestions}
                    visibleFurnitureIds={visibleFurnitureIds}
                    onChangeVisibleFurnitureIds={setVisibleFurnitureIds}
                  />
                )}
                {activeTab === "estimate" && <MaterialEstimator rooms={result.rooms} />}
              </div>
            </div>

            <aside className="flex flex-col gap-4">
              <SpacePlanningPanel result={result} />
              <MetadataPanel result={result} />
            </aside>
          </div>
        </div>
      )}
    </main>
  );
}

// -----------------------------------------------------------------------------
// Sub-sections
// -----------------------------------------------------------------------------

function Header() {
  return (
    <header className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
        <Compass className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-slate-900">AI Plan Analyzer &amp; Redrawer</h1>
        <p className="text-sm text-slate-500">
          Upload a blueprint or hand sketch to get layout analysis, a clean vector redraw, space-planning review,
          furniture suggestions, and a material cost estimate.
        </p>
      </div>
    </header>
  );
}

function UploadPanel({
  uploadedFile,
  onFileSelected,
  onClear,
  isAnalyzing,
  knownScale,
  onKnownScaleChange,
  onAnalyze,
  error,
}: {
  uploadedFile: UploadedFileState | null;
  onFileSelected: (f: UploadedFileState) => void;
  onClear: () => void;
  isAnalyzing: boolean;
  knownScale: string;
  onKnownScaleChange: (v: string) => void;
  onAnalyze: () => void;
  error: string | null;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <UploadZone
        onFileSelected={onFileSelected}
        currentFile={uploadedFile}
        isAnalyzing={isAnalyzing}
        onClear={onClear}
      />

      {uploadedFile && !isAnalyzing && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">
              Known scale (optional) — e.g. <code className="rounded bg-slate-100 px-1">1/4&quot; = 1&apos;-0&quot;</code> or{" "}
              <code className="rounded bg-slate-100 px-1">1:100</code>
            </span>
            <input
              type="text"
              value={knownScale}
              onChange={(e) => onKnownScaleChange(e.target.value)}
              placeholder="Leave blank to auto-detect"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </label>

          <button
            type="button"
            onClick={onAnalyze}
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            <Sparkles className="h-4 w-4" />
            Analyze Plan
          </button>
        </div>
      )}

      {isAnalyzing && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing plan — reading rooms, walls, and dimensions...
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function ResultSummaryBar({
  result,
  onStartOver,
  criticalCount,
}: {
  result: PlanAnalysisResult;
  onStartOver: () => void;
  criticalCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <SummaryStat icon={Ruler} label="Total Area" value={formatDimension(result.metadata.totalArea, { asArea: true })} />
        <SummaryStat icon={Building2} label="Rooms" value={String(result.metadata.totalRoomCount)} />
        <SummaryStat icon={Layers} label="Stories" value={String(result.metadata.stories)} />
        {criticalCount > 0 && (
          <SummaryStat
            icon={AlertTriangle}
            label="Flags"
            value={String(criticalCount)}
            accentClassName="text-amber-600"
          />
        )}
      </div>
      <button
        type="button"
        onClick={onStartOver}
        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        Analyze another plan
      </button>
    </div>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  accentClassName,
}: {
  icon: typeof Ruler;
  label: string;
  value: string;
  accentClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={["h-4 w-4", accentClassName ?? "text-indigo-600"].join(" ")} />
      <div className="leading-tight">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        <p className={["text-sm font-semibold", accentClassName ?? "text-slate-800"].join(" ")}>{value}</p>
      </div>
    </div>
  );
}

function SpacePlanningPanel({ result }: { result: PlanAnalysisResult }) {
  if (result.spacePlanningComments.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">Space Planning Review</h3>
      <ul className="flex flex-col gap-2">
        {result.spacePlanningComments.map((c) => (
          <li key={c.id} className="rounded-lg bg-slate-50 p-2.5 text-xs">
            <p className="font-medium text-slate-700">{c.title}</p>
            <p className="mt-0.5 text-slate-500">{c.description}</p>
            {c.recommendation && <p className="mt-1 italic text-indigo-600">→ {c.recommendation}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetadataPanel({ result }: { result: PlanAnalysisResult }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">Layout Description</h3>
      <p className="text-xs leading-relaxed text-slate-600">{result.metadata.layoutDescription}</p>

      {result.metadata.notableFeatures.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {result.metadata.notableFeatures.map((feature) => (
            <span key={feature} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
              {feature}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
        <span>Scale: {result.scaleCalibration.scaleLabel ?? "auto-estimated"}</span>
        <span>Confidence: {Math.round(result.overallConfidence * 100)}%</span>
      </div>

      {result.warnings.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-700">
          <p className="mb-1 font-semibold">Warnings</p>
          <ul className="list-inside list-disc space-y-0.5">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:<mime>;base64," prefix.
      const base64 = result.substring(result.indexOf(",") + 1);
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}
