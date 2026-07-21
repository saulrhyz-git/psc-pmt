"use client";

/**
 * components/FurnitureOverlay.tsx
 * -----------------------------------------------------------------------------
 * Sidebar control panel for the AI-suggested furniture layout. Lets the user
 * toggle individual suggestions on/off, filter by room, and see the rationale
 * behind each placement. Visibility state (`visibleFurnitureIds`) is lifted to
 * the parent so it can be passed straight into SVGPlanRenderer's furniture
 * layer for a synced overlay.
 * -----------------------------------------------------------------------------
 */

import { useMemo, useState } from "react";
import { ChevronDown, Eye, EyeOff, Sofa } from "lucide-react";
import type { FurnitureSuggestion, Room } from "@/lib/types";
import { formatMetersCentimeters } from "@/lib/measurement-utils";

interface FurnitureOverlayProps {
  rooms: Room[];
  suggestions: FurnitureSuggestion[];
  visibleFurnitureIds: Set<string>;
  onChangeVisibleFurnitureIds: (next: Set<string>) => void;
}

export default function FurnitureOverlay({
  rooms,
  suggestions,
  visibleFurnitureIds,
  onChangeVisibleFurnitureIds,
}: FurnitureOverlayProps) {
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<string>>(new Set(rooms.map((r) => r.id)));

  const roomsById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  const suggestionsByRoom = useMemo(() => {
    const map = new Map<string, FurnitureSuggestion[]>();
    for (const s of suggestions) {
      const list = map.get(s.roomId) ?? [];
      list.push(s);
      map.set(s.roomId, list);
    }
    return map;
  }, [suggestions]);

  const allVisible = suggestions.length > 0 && suggestions.every((s) => visibleFurnitureIds.has(s.id));

  const toggleAll = () => {
    onChangeVisibleFurnitureIds(allVisible ? new Set() : new Set(suggestions.map((s) => s.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(visibleFurnitureIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChangeVisibleFurnitureIds(next);
  };

  const toggleRoomExpanded = (roomId: string) => {
    setExpandedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
        <Sofa className="h-6 w-6 text-slate-400" />
        No furniture suggestions were generated for this plan.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Sofa className="h-4 w-4 text-indigo-600" />
          Furniture Layout Suggestions
        </h3>
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {allVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {allVisible ? "Hide all" : "Show all"}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {Array.from(suggestionsByRoom.entries()).map(([roomId, items]) => {
          const room = roomsById.get(roomId);
          const expanded = expandedRoomIds.has(roomId);
          return (
            <div key={roomId} className="overflow-hidden rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => toggleRoomExpanded(roomId)}
                className="flex w-full items-center justify-between bg-slate-50 px-3 py-2 text-left text-xs font-semibold text-slate-700"
              >
                <span>
                  {room?.name ?? "Unknown room"}{" "}
                  <span className="font-normal text-slate-400">({items.length} item{items.length === 1 ? "" : "s"})</span>
                </span>
                <ChevronDown className={["h-3.5 w-3.5 transition-transform", expanded ? "rotate-180" : ""].join(" ")} />
              </button>

              {expanded && (
                <ul className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const visible = visibleFurnitureIds.has(item.id);
                    return (
                      <li key={item.id} className="flex items-start gap-2 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleOne(item.id)}
                          aria-pressed={visible}
                          className={[
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            visible ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white",
                          ].join(" ")}
                        >
                          {visible && <div className="h-1.5 w-1.5 rounded-sm bg-white" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-800">{item.label}</p>
                          <p className="text-[11px] text-slate-500">
                            {formatMetersCentimeters(item.footprint.width)} × {formatMetersCentimeters(item.footprint.length)}
                          </p>
                          {item.rationale && <p className="mt-0.5 text-[11px] italic text-slate-400">{item.rationale}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
