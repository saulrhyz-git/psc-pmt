"use client";

/**
 * components/Sidebar.tsx
 * -----------------------------------------------------------------------------
 * Collapsible left-hand navigation between the app's tools. Collapsed state
 * persists across visits in localStorage (same pattern as the vision
 * provider choice in app/page.tsx).
 * -----------------------------------------------------------------------------
 */

import { Compass, HardHat, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { AppTool } from "@/lib/types";

interface SidebarProps {
  activeTool: AppTool;
  onSelectTool: (tool: AppTool) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const NAV_ITEMS: { key: AppTool; label: string; icon: typeof Compass; description: string }[] = [
  { key: "plan-analyzer", label: "Plan Analyzer", icon: Compass, description: "AI blueprint analysis & redraw" },
  { key: "project-management", label: "Project Management", icon: HardHat, description: "Tasks, budget, crew & schedule" },
];

export default function Sidebar({ activeTool, onSelectTool, collapsed, onToggleCollapsed }: SidebarProps) {
  return (
    <aside
      className={[
        "flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200",
        collapsed ? "w-[68px]" : "w-60",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-3">
        {!collapsed && <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tools</span>}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex flex-col gap-1 p-2">
        {NAV_ITEMS.map(({ key, label, icon: Icon, description }) => {
          const active = activeTool === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectTool(key)}
              title={collapsed ? label : undefined}
              className={[
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm font-medium transition-colors",
                active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              <Icon className={["h-4 w-4 shrink-0", active ? "text-indigo-600" : "text-slate-400"].join(" ")} />
              {!collapsed && (
                <span className="flex flex-col leading-tight">
                  <span>{label}</span>
                  <span className="text-[11px] font-normal text-slate-400">{description}</span>
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
