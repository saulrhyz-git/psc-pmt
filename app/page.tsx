"use client";

/**
 * app/page.tsx
 * -----------------------------------------------------------------------------
 * App shell: session gate, collapsible sidebar, and top bar shared by all
 * three tools. Tool-specific logic lives in components/PlanAnalyzerTool.tsx
 * (Tool #1), components/pm/ProjectManagementTool.tsx (Tool #2), and
 * components/settings-templates/SettingsTemplatesTool.tsx (AI settings, user
 * management, and reusable templates) — this file only owns session state and
 * sidebar/tool selection.
 *
 * Settings used to be a gear-icon modal (components/SettingsPanel.tsx); it's
 * now a full sidebar tab (see Sidebar.tsx) so it can hold the new Templates
 * sub-tab alongside AI provider settings and user management.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import PlanAnalyzerTool from "@/components/PlanAnalyzerTool";
import ProjectManagementTool from "@/components/pm/ProjectManagementTool";
import SettingsTemplatesTool from "@/components/settings-templates/SettingsTemplatesTool";
import type { AppTool, MeResponseBody, SessionUser } from "@/lib/types";

/** localStorage key remembering whether the sidebar was left collapsed. */
const SIDEBAR_COLLAPSED_KEY = "app-shell:sidebar-collapsed";
/** localStorage key remembering the last tool the user had open. */
const ACTIVE_TOOL_KEY = "app-shell:active-tool";

const TOOL_LABELS: Record<AppTool, string> = {
  "plan-analyzer": "AI Plan Analyzer & Redrawer",
  "project-management": "Project Management",
  "settings-templates": "Settings & Templates",
};

export default function AppShellPage() {
  const router = useRouter();
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeTool, setActiveTool] = useState<AppTool>("plan-analyzer");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const savedCollapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (savedCollapsed === "true") setSidebarCollapsed(true);
    const savedTool = window.localStorage.getItem(ACTIVE_TOOL_KEY);
    if (savedTool === "plan-analyzer" || savedTool === "project-management" || savedTool === "settings-templates") {
      setActiveTool(savedTool);
    }
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
        <TopBar title={TOOL_LABELS[activeTool]} sessionUser={sessionUser} onLogout={handleLogout} />

        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6 lg:p-8">
          {/*
            All three tools stay mounted for the lifetime of the session and are
            merely hidden with CSS, rather than conditionally rendered with `&&`.
            Conditional rendering would unmount/remount a tool on every sidebar
            switch, wiping its component state — e.g. a user analyzing a plan,
            switching to Project Management to confirm "Add to Project" worked,
            then switching back to find their analysis gone. Keeping them mounted
            preserves in-progress work (uploaded file, analysis result, cost
            estimate edits, etc.) until the user explicitly starts over.
          */}
          <div className={activeTool === "plan-analyzer" ? undefined : "hidden"}>
            <PlanAnalyzerTool
              canConfigureSettings={sessionUser.role === "admin"}
              onOpenSettings={() => handleSelectTool("settings-templates")}
            />
          </div>
          <div className={activeTool === "project-management" ? undefined : "hidden"}>
            <ProjectManagementTool />
          </div>
          <div className={activeTool === "settings-templates" ? undefined : "hidden"}>
            <SettingsTemplatesTool isAdmin={sessionUser.role === "admin"} />
          </div>
        </main>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Top bar
// -----------------------------------------------------------------------------

function TopBar({
  title,
  sessionUser,
  onLogout,
}: {
  title: string;
  sessionUser: SessionUser;
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
