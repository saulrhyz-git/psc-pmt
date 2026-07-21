"use client";

/**
 * app/page.tsx
 * -----------------------------------------------------------------------------
 * App shell: session gate, collapsible sidebar, and top bar shared by both
 * tools. Tool-specific logic lives in components/PlanAnalyzerTool.tsx (Tool
 * #1) and components/pm/ProjectManagementTool.tsx (Tool #2) — this file only
 * owns session state, sidebar/tool selection, and the AI-settings modal
 * (which is cross-cutting: Settings holds both AI provider keys used by Tool
 * #1 and user management shared by the whole app).
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Settings as SettingsIcon } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import PlanAnalyzerTool from "@/components/PlanAnalyzerTool";
import ProjectManagementTool from "@/components/pm/ProjectManagementTool";
import SettingsPanel from "@/components/SettingsPanel";
import type { AppTool, MeResponseBody, SessionUser } from "@/lib/types";

/** localStorage key remembering whether the sidebar was left collapsed. */
const SIDEBAR_COLLAPSED_KEY = "app-shell:sidebar-collapsed";
/** localStorage key remembering the last tool the user had open. */
const ACTIVE_TOOL_KEY = "app-shell:active-tool";

const TOOL_LABELS: Record<AppTool, string> = {
  "plan-analyzer": "AI Plan Analyzer & Redrawer",
  "project-management": "Project Management",
};

export default function AppShellPage() {
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeTool, setActiveTool] = useState<AppTool>("plan-analyzer");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const savedCollapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (savedCollapsed === "true") setSidebarCollapsed(true);
    const savedTool = window.localStorage.getItem(ACTIVE_TOOL_KEY);
    if (savedTool === "plan-analyzer" || savedTool === "project-management") setActiveTool(savedTool);
  }, []);

  const handleSelectTool = useCallback((tool: AppTool) => {
    setActiveTool(tool);
    window.localStorage.setItem(ACTIVE_TOOL_KEY, tool);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  // middleware.ts redirects page loads with no session cookie at all, but it
  // can't verify the cookie's signature (Edge runtime has no fs access) — so
  // a tampered/expired cookie can still reach this page. Confirm the session
  // is actually valid here and bounce to /login if not.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const payload = (await res.json()) as MeResponseBody;
        if (cancelled) return;
        if (!payload.authenticated || !payload.user) {
          router.replace("/login");
          return;
        }
        setSessionUser(payload.user);
      } catch {
        if (!cancelled) router.replace("/login");
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }, [router]);

  if (sessionLoading || !sessionUser) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking session...
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        activeTool={activeTool}
        onSelectTool={handleSelectTool}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={handleToggleSidebar}
      />

      <div className="flex min-h-screen flex-1 flex-col">
        <TopBar
          title={TOOL_LABELS[activeTool]}
          sessionUser={sessionUser}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onLogout={handleLogout}
        />

        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6 lg:p-8">
          {activeTool === "plan-analyzer" ? (
            <PlanAnalyzerTool
              canConfigureSettings={sessionUser.role === "admin"}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          ) : (
            <ProjectManagementTool />
          )}
        </main>
      </div>

      {sessionUser.role === "admin" && (
        <SettingsPanel open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Top bar
// -----------------------------------------------------------------------------

function TopBar({
  title,
  sessionUser,
  onOpenSettings,
  onLogout,
}: {
  title: string;
  sessionUser: SessionUser;
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
      <h2 className="truncate text-sm font-semibold text-slate-800">{title}</h2>

      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden text-xs text-slate-500 sm:inline">
          Signed in as <span className="font-medium text-slate-700">{sessionUser.username}</span>
          {sessionUser.role === "admin" && (
            <span className="ml-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
              admin
            </span>
          )}
        </span>
        {sessionUser.role === "admin" && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
          >
            <SettingsIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
