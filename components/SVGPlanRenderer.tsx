"use client";

/**
 * components/SVGPlanRenderer.tsx
 * -----------------------------------------------------------------------------
 * Renders the clean, redrawn vector plan from SVGVectorData. Supports:
 *   - Pan (click-drag) and zoom (scroll wheel + buttons)
 *   - Layer toggles: walls, room labels, dimensions, furniture, fixtures, grid
 *   - Room highlighting on hover/click, with a callback for parent components
 *     (e.g. to sync selection with RoomBreakdownTable)
 *
 * Pure SVG (no canvas library) keeps this dependency-free and crisp at any
 * zoom level.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { Grid3x3, LayoutGrid, Maximize2, Minus, Plus, Ruler, Sofa, Tag } from "lucide-react";
import type { FurnitureSuggestion, PlanLayer, Room, SVGVectorData } from "@/lib/types";
import { formatDimension } from "@/lib/measurement-utils";

interface SVGPlanRendererProps {
  data: SVGVectorData;
  selectedRoomId?: string | null;
  onSelectRoom?: (roomId: string | null) => void;
  /** Full set of AI furniture suggestions. Rendered when the "furniture" layer is active. */
  furnitureSuggestions?: FurnitureSuggestion[];
  /** Subset of furnitureSuggestions[].id currently enabled by the user in FurnitureOverlay. Defaults to all. */
  visibleFurnitureIds?: Set<string>;
  className?: string;
}

const LAYER_CONFIG: { key: PlanLayer; label: string; icon: typeof Ruler; defaultOn: boolean }[] = [
  { key: "walls", label: "Walls", icon: LayoutGrid, defaultOn: true },
  { key: "labels", label: "Room Labels", icon: Tag, defaultOn: true },
  { key: "dimensions", label: "Dimensions", icon: Ruler, defaultOn: true },
  { key: "furniture", label: "Furniture", icon: Sofa, defaultOn: false },
  { key: "grid", label: "Grid", icon: Grid3x3, defaultOn: false },
];

const ROOM_FILL_COLORS: Record<string, string> = {
  bedroom: "#e0e7ff",
  bathroom: "#cffafe",
  kitchen: "#fef3c7",
  "living-room": "#fce7f3",
  "dining-room": "#fae8ff",
  hallway: "#f1f5f9",
  closet: "#e2e8f0",
  garage: "#e5e7eb",
  office: "#dbeafe",
  laundry: "#ecfccb",
  utility: "#f5f5f4",
  outdoor: "#d1fae5",
  stairwell: "#fee2e2",
  other: "#f3f4f6",
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;

export default function SVGPlanRenderer({
  data,
  selectedRoomId,
  onSelectRoom,
  furnitureSuggestions = [],
  visibleFurnitureIds,
  className,
}: SVGPlanRendererProps) {
  const [activeLayers, setActiveLayers] = useState<Set<PlanLayer>>(
    () => new Set(LAYER_CONFIG.filter((l) => l.defaultOn).map((l) => l.key))
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const svgContainerRef = useRef<HTMLDivElement>(null);

  const toggleLayer = useCallback((layer: PlanLayer) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM));
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((z) => clamp(z * factor, MIN_ZOOM, MAX_ZOOM));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setIsPanning(true);
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPanning) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
    },
    [isPanning]
  );

  const stopPanning = useCallback(() => setIsPanning(false), []);

  const roomsById = useMemo(() => {
    const map = new Map<string, Room>();
    data.rooms.forEach((r) => map.set(r.id, r));
    return map;
  }, [data.rooms]);

  return (
    <div className={["flex h-full w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white", className].join(" ")}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {LAYER_CONFIG.map(({ key, label, icon: Icon }) => {
            const active = activeLayers.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleLayer(key)}
                aria-pressed={active}
                className={[
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200",
                ].join(" ")}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomBy(0.85)}
            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
            aria-label="Zoom out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => zoomBy(1.15)}
            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
            aria-label="Zoom in"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="ml-1 rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
            aria-label="Reset view"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={svgContainerRef}
        className={["relative flex-1 overflow-hidden bg-slate-100", isPanning ? "cursor-grabbing" : "cursor-grab"].join(" ")}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopPanning}
        onMouseLeave={stopPanning}
      >
        <svg
          viewBox={data.viewBox}
          className="h-full w-full select-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isPanning ? "none" : "transform 80ms ease-out",
          }}
        >
          {activeLayers.has("grid") && <GridLayer viewBox={data.viewBox} />}

          {/* Room fills (always rendered so hover/selection works even with "walls" off) */}
          <g>
            {data.rooms.map((room) => {
              const isSelected = room.id === selectedRoomId;
              const isHovered = room.id === hoveredRoomId;
              const pointsAttr = room.polygon.points.map((p) => `${p.x},${p.y}`).join(" ");
              return (
                <polygon
                  key={room.id}
                  points={pointsAttr}
                  fill={ROOM_FILL_COLORS[room.type] ?? ROOM_FILL_COLORS.other}
                  fillOpacity={isSelected ? 0.95 : isHovered ? 0.85 : 0.65}
                  stroke={isSelected ? "#4338ca" : "transparent"}
                  strokeWidth={isSelected ? 3 : 0}
                  className="cursor-pointer transition-opacity"
                  onMouseEnter={() => setHoveredRoomId(room.id)}
                  onMouseLeave={() => setHoveredRoomId((id) => (id === room.id ? null : id))}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRoom?.(isSelected ? null : room.id);
                  }}
                />
              );
            })}
          </g>

          {activeLayers.has("walls") && <WallsLayer walls={data.walls} />}
          {activeLayers.has("walls") && <OpeningsLayer openings={data.openings} walls={data.walls} />}
          {activeLayers.has("furniture") && (
            <FurnitureLayer suggestions={furnitureSuggestions} visibleIds={visibleFurnitureIds} scale={data.scale} />
          )}
          {activeLayers.has("labels") && <LabelsLayer rooms={data.rooms} hoveredRoomId={hoveredRoomId} />}
          {activeLayers.has("dimensions") && <DimensionsLayer annotations={data.dimensionAnnotations} />}
        </svg>

        {hoveredRoomId && roomsById.get(hoveredRoomId) && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-slate-900/90 px-3 py-2 text-xs text-white shadow-lg">
            <p className="font-semibold">{roomsById.get(hoveredRoomId)!.name}</p>
            <p className="text-slate-300">{formatDimension(roomsById.get(hoveredRoomId)!.area, { asArea: true })}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Layer sub-components
// -----------------------------------------------------------------------------

function GridLayer({ viewBox }: { viewBox: string }) {
  const [, , w, h] = viewBox.split(" ").map(Number);
  const step = 25;
  const lines: React.ReactNode[] = [];
  for (let x = 0; x <= w; x += step) {
    lines.push(<line key={`gx-${x}`} x1={x} y1={0} x2={x} y2={h} stroke="#cbd5e1" strokeWidth={0.5} />);
  }
  for (let y = 0; y <= h; y += step) {
    lines.push(<line key={`gy-${y}`} x1={0} y1={y} x2={w} y2={y} stroke="#cbd5e1" strokeWidth={0.5} />);
  }
  return <g opacity={0.5}>{lines}</g>;
}

function WallsLayer({ walls }: { walls: SVGVectorData["walls"] }) {
  return (
    <g>
      {walls.map((wall) => (
        <line
          key={wall.id}
          x1={wall.start.x}
          y1={wall.start.y}
          x2={wall.end.x}
          y2={wall.end.y}
          stroke={wall.type === "exterior" ? "#1e293b" : "#64748b"}
          strokeWidth={wall.type === "exterior" ? 6 : 4}
          strokeLinecap="square"
        />
      ))}
    </g>
  );
}

function OpeningsLayer({ openings, walls }: { openings: SVGVectorData["openings"]; walls: SVGVectorData["walls"] }) {
  const wallsById = useMemo(() => new Map(walls.map((w) => [w.id, w])), [walls]);

  return (
    <g>
      {openings.map((opening) => {
        const wall = wallsById.get(opening.wallId);
        if (!wall) return null;
        const px = wall.start.x + (wall.end.x - wall.start.x) * opening.positionAlongWall;
        const py = wall.start.y + (wall.end.y - wall.start.y) * opening.positionAlongWall;
        const isWindow = opening.type === "window";
        return (
          <g key={opening.id}>
            <circle cx={px} cy={py} r={isWindow ? 4 : 5} fill={isWindow ? "#0ea5e9" : "#f59e0b"} stroke="#fff" strokeWidth={1} />
          </g>
        );
      })}
    </g>
  );
}

function LabelsLayer({ rooms, hoveredRoomId }: { rooms: Room[]; hoveredRoomId: string | null }) {
  return (
    <g>
      {rooms.map((room) => (
        <g key={room.id} className="pointer-events-none">
          <text
            x={room.labelPosition.x}
            y={room.labelPosition.y}
            textAnchor="middle"
            fontSize={room.id === hoveredRoomId ? 15 : 13}
            fontWeight={600}
            fill="#1e293b"
          >
            {room.name}
          </text>
          <text
            x={room.labelPosition.x}
            y={room.labelPosition.y + 16}
            textAnchor="middle"
            fontSize={11}
            fill="#475569"
          >
            {formatDimension(room.area, { asArea: true })}
          </text>
        </g>
      ))}
    </g>
  );
}

function DimensionsLayer({ annotations }: { annotations: SVGVectorData["dimensionAnnotations"] }) {
  return (
    <g>
      {annotations.map((a) => {
        const midX = (a.start.x + a.end.x) / 2;
        const midY = (a.start.y + a.end.y) / 2;
        return (
          <g key={a.id} className="pointer-events-none">
            <line x1={a.start.x} y1={a.start.y} x2={a.end.x} y2={a.end.y} stroke="#94a3b8" strokeWidth={1} strokeDasharray="2,2" />
            <rect x={midX - 20} y={midY - 8} width={40} height={14} fill="white" opacity={0.85} />
            <text x={midX} y={midY + 3} textAnchor="middle" fontSize={9} fill="#334155">
              {formatDimension(a.value)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function FurnitureLayer({
  suggestions,
  visibleIds,
  scale,
}: {
  suggestions: FurnitureSuggestion[];
  visibleIds?: Set<string>;
  scale: SVGVectorData["scale"];
}) {
  // Convert a footprint measured in real-world meters back into normalized plan-space
  // units using the same calibration the model derived (unitsPerPixel = real units per
  // normalized unit). Guard against a zero/undefined ratio with a safe fallback.
  const unitsPerM = scale.unitsPerPixel && scale.unitsPerPixel > 0 ? 1 / scale.unitsPerPixel : 25;

  return (
    <g>
      {suggestions
        .filter((item) => !visibleIds || visibleIds.has(item.id))
        .map((item) => {
          const w = item.footprint.width.value * unitsPerM;
          const l = item.footprint.length.value * unitsPerM;
          return (
            <g
              key={item.id}
              transform={`translate(${item.position.x}, ${item.position.y}) rotate(${item.rotation})`}
              className="pointer-events-none"
            >
              <rect
                x={-w / 2}
                y={-l / 2}
                width={w}
                height={l}
                rx={3}
                fill="#a78bfa"
                fillOpacity={0.5}
                stroke="#7c3aed"
                strokeWidth={1.5}
              />
              <text textAnchor="middle" fontSize={9} fill="#4c1d95" y={3}>
                {item.label}
              </text>
            </g>
          );
        })}
    </g>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
