"use client";

/**
 * components/PlanViewer.tsx
 * -----------------------------------------------------------------------------
 * Split-screen viewer comparing the original uploaded blueprint against the
 * clean, redrawn SVG artifact. Supports a side-by-side layout and a toggle
 * layout for smaller viewports. Wraps SVGPlanRenderer for the "clean" side.
 * -----------------------------------------------------------------------------
 */

import { useState } from "react";
import { Columns2, FileImage, Sparkles, SquareStack } from "lucide-react";
import type { FurnitureSuggestion, SVGVectorData, UploadedFileState } from "@/lib/types";
import SVGPlanRenderer from "./SVGPlanRenderer";

interface PlanViewerProps {
  originalFile: UploadedFileState;
  svgVectorData: SVGVectorData;
  selectedRoomId?: string | null;
  onSelectRoom?: (roomId: string | null) => void;
  furnitureSuggestions?: FurnitureSuggestion[];
  visibleFurnitureIds?: Set<string>;
}

type ViewMode = "split" | "stacked";

export default function PlanViewer({
  originalFile,
  svgVectorData,
  selectedRoomId,
  onSelectRoom,
  furnitureSuggestions,
  visibleFurnitureIds,
}: PlanViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("split");

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Original vs. Redrawn Plan</h2>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
          <ViewModeButton icon={Columns2} active={viewMode === "split"} onClick={() => setViewMode("split")} label="Side by side" />
          <ViewModeButton icon={SquareStack} active={viewMode === "stacked"} onClick={() => setViewMode("stacked")} label="Stacked" />
        </div>
      </div>

      <div className={["grid flex-1 gap-3", viewMode === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"].join(" ")}>
        <div className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
            <FileImage className="h-3.5 w-3.5" />
            Original Upload
          </div>
          <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-100 p-3">
            {originalFile.mimeType === "application/pdf" ? (
              <embed src={originalFile.previewUrl} type="application/pdf" className="h-full min-h-[280px] w-full rounded-md" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={originalFile.previewUrl}
                alt="Original uploaded blueprint"
                className="max-h-full max-w-full rounded-md object-contain shadow-sm"
              />
            )}
          </div>
        </div>

        <div className="flex min-h-[320px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-indigo-600">
            <Sparkles className="h-3.5 w-3.5" />
            Clean Redrawn Artifact
          </div>
          <div className="flex-1">
            <SVGPlanRenderer
              data={svgVectorData}
              selectedRoomId={selectedRoomId}
              onSelectRoom={onSelectRoom}
              furnitureSuggestions={furnitureSuggestions}
              visibleFurnitureIds={visibleFurnitureIds}
              className="h-full border-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewModeButton({
  icon: Icon,
  active,
  onClick,
  label,
}: {
  icon: typeof Columns2;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={[
        "rounded-md p-1.5 transition-colors",
        active ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
