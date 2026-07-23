"use client";

/**
 * components/pm/GanttChart.tsx
 * -----------------------------------------------------------------------------
 * Custom, dependency-free Gantt-style timeline: no charting library needed,
 * just percentage-positioned divs inside a relative container, computed from
 * each task's startDate/endDate. Bars are color-coded by phase (see
 * phase-colors.ts) so the same phase renders the same color as it does in
 * TaskList and BudgetTracker.
 * -----------------------------------------------------------------------------
 */

import { useMemo } from "react";
import type { ProjectTask } from "@/lib/project-types";
import { getPhaseColor } from "@/components/pm/phase-colors";

interface GanttChartProps {
  tasks: ProjectTask[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export default function GanttChart({ tasks }: GanttChartProps) {
  const { sortedTasks, monthTicks, todayPercent } = useMemo(() => buildTimeline(tasks), [tasks]);

  if (tasks.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">Add tasks to see the schedule timeline.</p>;
  }

  const phases = Array.from(new Set(tasks.map((t) => t.phase))).sort();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {phases.map((phase) => {
          const color = getPhaseColor(phase);
          return (
            <span key={phase} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className={["h-2 w-2 rounded-full", color.dot].join(" ")} />
              {phase}
            </span>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <div className="min-w-[640px]">
          {/* Month header */}
          <div className="relative h-7 border-b border-slate-200 bg-slate-50">
            {monthTicks.map((tick) => (
              <div
                key={tick.label + tick.leftPercent}
                className="absolute top-0 h-full border-l border-slate-200 pl-1.5 text-[10px] font-medium text-slate-400"
                style={{ left: `${tick.leftPercent}%` }}
              >
                <span className="leading-7">{tick.label}</span>
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="relative">
            {todayPercent !== null && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-red-400"
                style={{ left: `${todayPercent}%` }}
                title="Today"
              >
                <span className="absolute -top-[1px] left-1 whitespace-nowrap text-[10px] font-semibold text-red-500">
                  Today
                </span>
              </div>
            )}
            {sortedTasks.map(({ task, leftPercent, widthPercent }) => {
              const color = getPhaseColor(task.phase);
              // Bars need a little width before the progress% label fits inside them
              // without overflowing into neighboring bars or the row edge.
              const labelFitsInsideBar = widthPercent >= 12;
              return (
                <div key={task.id} className="flex items-center border-b border-slate-100 last:border-b-0">
                  <div className="w-44 shrink-0 px-2 py-1.5">
                    <p className="truncate text-xs font-medium text-slate-600" title={task.title}>
                      {task.title}
                    </p>
                    <p className="truncate text-[10px] text-slate-400" title={`${task.phase} · ${task.startDate} → ${task.endDate}`}>
                      {task.phase} · {task.startDate} → {task.endDate}
                    </p>
                  </div>
                  <div className="relative h-9 flex-1 border-l border-slate-100">
                    <div
                      className={["absolute top-1.5 flex h-6 items-center rounded-md opacity-90", color.bar].join(" ")}
                      style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                      title={`${task.title}: ${task.startDate} → ${task.endDate} (${task.progressPercent}% complete)`}
                    >
                      <div
                        className="absolute inset-y-0 right-0 rounded-md bg-black/20"
                        style={{ width: `${100 - task.progressPercent}%` }}
                      />
                      {labelFitsInsideBar && (
                        <span className="relative px-1.5 text-[10px] font-semibold leading-none text-white drop-shadow-sm">
                          {task.progressPercent}%
                        </span>
                      )}
                    </div>
                    {!labelFitsInsideBar && (
                      <span
                        className="absolute top-2 whitespace-nowrap text-[10px] font-medium text-slate-500"
                        style={{ left: `calc(${leftPercent}% + ${widthPercent}% + 4px)` }}
                      >
                        {task.progressPercent}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildTimeline(tasks: ProjectTask[]) {
  if (tasks.length === 0) {
    return { sortedTasks: [], monthTicks: [], todayPercent: null as number | null };
  }

  const starts = tasks.map((t) => new Date(t.startDate).getTime());
  const ends = tasks.map((t) => new Date(t.endDate).getTime());
  let minDate = Math.min(...starts);
  let maxDate = Math.max(...ends);

  // Pad the range by a few days on each side so bars at the edges aren't clipped.
  minDate -= DAY_MS * 2;
  maxDate += DAY_MS * 2;
  const totalSpan = Math.max(maxDate - minDate, DAY_MS);

  const sortedTasks = [...tasks]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((task) => {
      const start = new Date(task.startDate).getTime();
      const end = new Date(task.endDate).getTime() + DAY_MS; // inclusive of end day
      const leftPercent = ((start - minDate) / totalSpan) * 100;
      const widthPercent = Math.max(((end - start) / totalSpan) * 100, 1.5);
      return { task, leftPercent, widthPercent };
    });

  const monthTicks: { label: string; leftPercent: number }[] = [];
  const cursor = new Date(minDate);
  cursor.setDate(1);
  const end = new Date(maxDate);
  while (cursor.getTime() <= end.getTime()) {
    const leftPercent = ((cursor.getTime() - minDate) / totalSpan) * 100;
    if (leftPercent >= 0 && leftPercent <= 100) {
      monthTicks.push({
        label: cursor.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        leftPercent,
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const now = Date.now();
  const todayPercent = now >= minDate && now <= maxDate ? ((now - minDate) / totalSpan) * 100 : null;

  return { sortedTasks, monthTicks, todayPercent };
}
