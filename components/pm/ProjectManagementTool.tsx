"use client";

/**
 * components/pm/ProjectManagementTool.tsx
 * -----------------------------------------------------------------------------
 * Tool #2: Project Management. Top-level orchestrator — owns the project
 * picker, the selected project's data bundle, and the sub-tab navigation
 * (Dashboard / Tasks / Issues / Gantt / Budget / Resources). Each sub-view is a
 * separate component that receives the bundle slice it needs plus an
 * `onChanged` callback that re-fetches the bundle after any mutation, so
 * KPIs/Gantt/budget totals always reflect the latest edits.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, HardHat, Loader2, Plus } from "lucide-react";
import type { Project, ProjectBundle, ProjectBundleResponseBody, ProjectsListResponseBody } from "@/lib/project-types";
import { computeProjectKpis } from "@/lib/project-kpi-utils";
import AddProjectModal from "@/components/pm/AddProjectModal";
import KpiCards from "@/components/pm/KpiCards";
import TaskList from "@/components/pm/TaskList";
import GanttChart from "@/components/pm/GanttChart";
import BudgetTracker from "@/components/pm/BudgetTracker";
import ResourceManagement from "@/components/pm/ResourceManagement";
import ExportButton from "@/components/pm/ExportButton";
import StatusBadge from "@/components/pm/StatusBadge";
import ReferenceFileLibrary from "@/components/pm/ReferenceFileLibrary";
import PlanAnalysesList from "@/components/pm/PlanAnalysesList";
import CostEstimatesList from "@/components/pm/CostEstimatesList";
import IssueTracker from "@/components/pm/IssueTracker";

type PmTab =
  | "dashboard"
  | "tasks"
  | "issues"
  | "gantt"
  | "budget"
  | "cost-estimate"
  | "resources"
  | "plan-analyses"
  | "reference-files";

const TABS: { key: PmTab; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "tasks", label: "Tasks" },
  { key: "issues", label: "Issues" },
  { key: "gantt", label: "Gantt Timeline" },
  { key: "budget", label: "Budget" },
  { key: "cost-estimate", label: "Cost Estimate" },
  { key: "resources", label: "Resources" },
  { key: "plan-analyses", label: "Plan Analyses" },
  { key: "reference-files", label: "Reference Files" },
];

export default function ProjectManagementTool() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PmTab>("dashboard");
  const [showAddProject, setShowAddProject] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const payload = (await res.json()) as ProjectsListResponseBody;
      if (!res.ok || !payload.success || !payload.projects) {
        throw new Error(payload.error || "Failed to load projects.");
      }
      setProjects(payload.projects);
      setSelectedProjectId((prev) => prev ?? payload.projects![0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects.");
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const fetchBundle = useCallback(async (projectId: string) => {
    setBundleLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/bundle`);
      const payload = (await res.json()) as ProjectBundleResponseBody;
      if (!res.ok || !payload.success || !payload.bundle) {
        throw new Error(payload.error || "Failed to load project data.");
      }
      setBundle(payload.bundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project data.");
      setBundle(null);
    } finally {
      setBundleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) void fetchBundle(selectedProjectId);
    else setBundle(null);
  }, [selectedProjectId, fetchBundle]);

  const handleProjectCreated = useCallback((project: Project) => {
    setProjects((prev) => [project, ...(prev ?? [])]);
    setSelectedProjectId(project.id);
    setShowAddProject(false);
  }, []);

  const handleChanged = useCallback(() => {
    if (selectedProjectId) void fetchBundle(selectedProjectId);
  }, [selectedProjectId, fetchBundle]);

  if (projects === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading projects...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Project Management</h1>
        <p className="text-sm text-slate-500">
          Manage projects, tasks, issues, schedule, budget, and crew &amp; equipment resources.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <ProjectPicker
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
        />
        <div className="flex items-center gap-2">
          {bundle && <ExportButton projectId={bundle.project.id} projectName={bundle.project.name} />}
          <button
            type="button"
            onClick={() => setShowAddProject(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {projects.length === 0 ? (
        <EmptyState onAddProject={() => setShowAddProject(true)} />
      ) : bundleLoading || !bundle ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading project data...
        </div>
      ) : (
        <>
          <ProjectHeaderCard project={bundle.project} />

          <div className="flex gap-1 border-b border-slate-200">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={[
                  "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  activeTab === key
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-700",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "dashboard" && (
            <div className="flex flex-col gap-6">
              <KpiCards kpis={computeProjectKpis(bundle)} />
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Schedule Overview</h3>
                <GanttChart tasks={bundle.tasks} />
              </div>
            </div>
          )}
          {activeTab === "tasks" && (
            <TaskList projectId={bundle.project.id} tasks={bundle.tasks} onChanged={handleChanged} />
          )}
          {activeTab === "issues" && <IssueTracker projectId={bundle.project.id} />}
          {activeTab === "gantt" && <GanttChart tasks={bundle.tasks} />}
          {activeTab === "budget" && (
            <BudgetTracker
              projectId={bundle.project.id}
              project={bundle.project}
              lineItems={bundle.budgetLineItems}
              onChanged={handleChanged}
            />
          )}
          {activeTab === "cost-estimate" && <CostEstimatesList projectId={bundle.project.id} />}
          {activeTab === "resources" && (
            <ResourceManagement
              projectId={bundle.project.id}
              crew={bundle.crew}
              equipment={bundle.equipment}
              onChanged={handleChanged}
            />
          )}
          {activeTab === "plan-analyses" && <PlanAnalysesList projectId={bundle.project.id} />}
          {activeTab === "reference-files" && <ReferenceFileLibrary projectId={bundle.project.id} />}
        </>
      )}

      <AddProjectModal open={showAddProject} onClose={() => setShowAddProject(false)} onCreated={handleProjectCreated} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function ProjectPicker({
  projects,
  selectedProjectId,
  onSelect,
}: {
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (id: string) => void;
}) {
  if (projects.length === 0) {
    return <span className="text-sm text-slate-400">No projects yet.</span>;
  }

  return (
    <div className="relative">
      <select
        value={selectedProjectId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full min-w-[220px] appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function ProjectHeaderCard({ project }: { project: Project }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-800">{project.name}</h2>
          <StatusBadge status={project.status} />
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {project.clientName} · In charge: {project.projectInCharge}
          {project.projectType ? ` · ${project.projectType}` : ""}
        </p>
      </div>
      <div className="text-right text-xs text-slate-500">
        <p>Started {project.dateStarted}</p>
        {project.targetCompletionDate && <p>Target completion {project.targetCompletionDate}</p>}
      </div>
    </div>
  );
}

function EmptyState({ onAddProject }: { onAddProject: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        <HardHat className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800">No projects yet</p>
        <p className="text-xs text-slate-500">Create your first project to start tracking tasks, budget, and crew.</p>
      </div>
      <button
        type="button"
        onClick={onAddProject}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
      >
        <Plus className="h-4 w-4" />
        New Project
      </button>
    </div>
  );
}
