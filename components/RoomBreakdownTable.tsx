"use client";

/**
 * components/RoomBreakdownTable.tsx
 * -----------------------------------------------------------------------------
 * Tabular breakdown of every room's dimensions, area, perimeter, and any
 * space-planning comments that apply to it. Row selection syncs with
 * SVGPlanRenderer's room highlighting via onSelectRoom.
 * -----------------------------------------------------------------------------
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpDown, Info, ShieldAlert, TriangleAlert } from "lucide-react";
import type { Room, SpacePlanningComment, SpacePlanningSeverity } from "@/lib/types";
import { formatDimension, formatMetersCentimeters } from "@/lib/measurement-utils";

interface RoomBreakdownTableProps {
  rooms: Room[];
  spacePlanningComments: SpacePlanningComment[];
  selectedRoomId?: string | null;
  onSelectRoom?: (roomId: string | null) => void;
}

type SortKey = "name" | "area" | "perimeter" | "type";

const SEVERITY_STYLES: Record<SpacePlanningSeverity, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "text-sky-600 bg-sky-50" },
  suggestion: { icon: Info, className: "text-indigo-600 bg-indigo-50" },
  warning: { icon: AlertTriangle, className: "text-amber-600 bg-amber-50" },
  critical: { icon: ShieldAlert, className: "text-red-600 bg-red-50" },
};

export default function RoomBreakdownTable({
  rooms,
  spacePlanningComments,
  selectedRoomId,
  onSelectRoom,
}: RoomBreakdownTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const commentsByRoom = useMemo(() => {
    const map = new Map<string, SpacePlanningComment[]>();
    for (const c of spacePlanningComments) {
      for (const roomId of c.roomIds) {
        const list = map.get(roomId) ?? [];
        list.push(c);
        map.set(roomId, list);
      }
    }
    return map;
  }, [spacePlanningComments]);

  const sortedRooms = useMemo(() => {
    const copy = [...rooms];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "type":
          cmp = a.type.localeCompare(b.type);
          break;
        case "area":
          cmp = a.area.value - b.area.value;
          break;
        case "perimeter":
          cmp = a.perimeter.value - b.perimeter.value;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [rooms, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((asc) => !asc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const totalArea = rooms.reduce((sum, r) => sum + r.area.value, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <SortableHeader label="Room" sortKey="name" activeKey={sortKey} asc={sortAsc} onSort={handleSort} />
              <SortableHeader label="Type" sortKey="type" activeKey={sortKey} asc={sortAsc} onSort={handleSort} />
              <th className="px-3 py-2 font-medium">Dimensions</th>
              <SortableHeader label="Area" sortKey="area" activeKey={sortKey} asc={sortAsc} onSort={handleSort} />
              <SortableHeader label="Perimeter" sortKey="perimeter" activeKey={sortKey} asc={sortAsc} onSort={handleSort} />
              <th className="px-3 py-2 font-medium">Notes / Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedRooms.map((room) => {
              const comments = commentsByRoom.get(room.id) ?? [];
              const isSelected = room.id === selectedRoomId;
              return (
                <tr
                  key={room.id}
                  onClick={() => onSelectRoom?.(isSelected ? null : room.id)}
                  className={[
                    "cursor-pointer transition-colors",
                    isSelected ? "bg-indigo-50" : "hover:bg-slate-50",
                  ].join(" ")}
                >
                  <td className="px-3 py-2.5 font-medium text-slate-800">{room.name}</td>
                  <td className="px-3 py-2.5 capitalize text-slate-500">{room.type.replace("-", " ")}</td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {room.approximateDimensions
                      ? `${formatMetersCentimeters(room.approximateDimensions.width)} × ${formatMetersCentimeters(room.approximateDimensions.length)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-700">{formatDimension(room.area, { asArea: true })}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-700">{formatDimension(room.perimeter)}</td>
                  <td className="px-3 py-2.5">
                    {comments.length === 0 ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {comments.map((c) => {
                          const style = SEVERITY_STYLES[c.severity];
                          const Icon = style.icon;
                          return (
                            <span
                              key={c.id}
                              title={c.description}
                              className={["flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", style.className].join(" ")}
                            >
                              <Icon className="h-3 w-3" />
                              {c.title}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50">
            <tr>
              <td className="px-3 py-2.5 font-semibold text-slate-700" colSpan={3}>
                Total ({rooms.length} rooms)
              </td>
              <td className="px-3 py-2.5 font-semibold tabular-nums text-slate-800">
                {formatDimension({ value: totalArea, unit: rooms[0]?.area.unit ?? "m" }, { asArea: true })}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {spacePlanningComments.some((c) => c.severity === "critical") && (
        <div className="flex items-center gap-2 border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          One or more critical space-planning issues were flagged. Review before finalizing.
        </div>
      )}
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  asc,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={["flex items-center gap-1 hover:text-slate-700", active ? "text-slate-800" : ""].join(" ")}
      >
        {label}
        <ArrowUpDown className={["h-3 w-3", active && !asc ? "rotate-180" : "", "transition-transform"].join(" ")} />
      </button>
    </th>
  );
}
