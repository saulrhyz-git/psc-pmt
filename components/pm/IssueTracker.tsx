"use client";

/**
 * components/pm/IssueTracker.tsx
 * -----------------------------------------------------------------------------
 * Construction issue / punch-list tracking (defects, RFIs, site problems) for
 * a project. Modeled closely on components/pm/TaskList.tsx: searchable +
 * filterable list, inline "add issue" form, per-row quick edits (status,
 * priority), delete. Self-fetching (like PlanAnalysesList/CostEstimatesList)
 * rather than sourced from the project bundle, so it doesn't affect
 * dashboard/Gantt refresh timing.
 *
 * Unlike Task, an issue isn't required to have a phase (some issues — site
 * safety, general RFIs — don't map to a construction phase), so the phase
 * chip is only shown when set.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import type {
  CreateIssueBody,
  IssueResponseBody,
  IssuesListResponseBody,
  IssueStatus,
  IssuePriority,
  ProjectIssue,
} from "@/lib/project-types";
import StatusBadge from "@/components/pm/StatusBadge";
import { getPhaseColor } from "@/components/pm/phase-colors";

interface IssueTrackerProps {
  projectId: string;
}

const STATUS_OPTIONS: { value: IssueStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITY_OPTIONS: { value: IssuePriority | "all"; label: string }[] = [
  { value: "all", label: "All priorities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const PRIORITY_STYLES: Record<IssuePriority, string> = {
  low: "bg-slate-100 text-slate-500",
  medium: "bg-sky-100 text-sky-700",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

const PRIORITY_LABELS: Record<IssuePriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

function PriorityBadge({ priority }: { priority: IssuePriority }) {
  return (
    <span className={["inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium", PRIORITY_STYLES[priority]].join(" ")}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

const EMPTY_FORM: CreateIssueBody = {
  title: "",
  description: "",
  phase: "",
  assignee: "",
  reportedBy: "",
  priority: "medium",
  dueDate: "",
};

export default function IssueTracker({ projectId }: IssueTrackerProps) {
  const [issues, setIssues] = useState<ProjectIssue[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<IssueStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<IssuePriority | "all">("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<CreateIssueBody>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyIssueId, setBusyIssueId] = useState<string | null>(null);

  const fetchIssues = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/issues`);
      const payload = (await res.json()) as IssuesListResponseBody;
      if (!res.ok || !payload.success || !payload.issues) {
        throw new Error(payload.error || "Failed to load issues.");
      }
      setIssues(payload.issues);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load issues.");
      setIssues([]);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchIssues();
  }, [fetchIssues]);

  const filtered = useMemo(() => {
    if (!issues) return [];
    const q = search.trim().toLowerCase();
    return issues.filter((issue) => {
      if (statusFilter !== "all" && issue.status !== statusFilter) return false;
      if (priorityFilter !== "all" && issue.priority !== priorityFilter) return false;
      if (q && !`${issue.title} ${issue.assignee ?? ""} ${issue.phase ?? ""} ${issue.reportedBy ?? ""}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [issues, search, statusFilter, priorityFilter]);

  async function handleAddIssue(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          description: form.description?.trim() || undefined,
          phase: form.phase?.trim() || undefined,
          assignee: form.assignee?.trim() || undefined,
          reportedBy: form.reportedBy?.trim() || undefined,
          dueDate: form.dueDate || undefined,
        }),
      });
      const payload = (await res.json()) as IssueResponseBody;
      if (!res.ok || !payload.success) throw new Error(payload.error || "Failed to add issue.");
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      void fetchIssues();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add issue.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(issue: ProjectIssue, status: IssueStatus) {
    setBusyIssueId(issue.id);
    try {
      await fetch(`/api/projects/${projectId}/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      void fetchIssues();
    } finally {
      setBusyIssueId(null);
    }
  }

  async function handlePriorityChange(issue: ProjectIssue, priority: IssuePriority) {
    setBusyIssueId(issue.id);
    try {
      await fetch(`/api/projects/${projectId}/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      void fetchIssues();
    } finally {
      setBusyIssueId(null);
    }
  }

  async function handleDelete(issue: ProjectIssue) {
    if (!window.confirm(`Delete issue "${issue.title}"?`)) return;
    setBusyIssueId(issue.id);
    try {
      await fetch(`/api/projects/${projectId}/issues/${issue.id}`, { method: "DELETE" });
      void fetchIssues();
    } finally {
      setBusyIssueId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search issues, assignee, phase, reporter..."
            className="w-full rounded-md border border-slate-200 py-2 pl-8 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as IssueStatus | "all")}
          className="rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as IssuePriority | "all")}
          className="rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          {PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowAddForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showAddForm ? "Cancel" : "Report Issue"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddIssue} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              required
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Issue title"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 sm:col-span-2"
            />
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as IssuePriority }))}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
              <option value="critical">Critical priority</option>
            </select>
            <input
              type="text"
              value={form.phase}
              onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}
              placeholder="Phase (optional, e.g. Framing)"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="text"
              value={form.assignee}
              onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
              placeholder="Assignee (optional)"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="text"
              value={form.reportedBy}
              onChange={(e) => setForm((f) => ({ ...f, reportedBy: e.target.value }))}
              placeholder="Reported by (optional)"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description (optional)"
              className="min-h-[60px] resize-y rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 sm:col-span-3"
            />
          </div>
          {formError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={saving}
            className="flex w-fit items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Issue
          </button>
        </form>
      )}

      {loadError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {issues === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading issues...
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Issue</th>
                <th className="px-3 py-2 font-medium">Assignee</th>
                <th className="px-3 py-2 font-medium">Reported By</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((issue) => {
                const busy = busyIssueId === issue.id;
                const phaseColor = issue.phase ? getPhaseColor(issue.phase) : null;
                return (
                  <tr key={issue.id} className={busy ? "opacity-50" : undefined}>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-700">{issue.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {phaseColor && (
                          <span className={["rounded-full px-2 py-0.5 text-[11px] font-medium", phaseColor.chip].join(" ")}>
                            {issue.phase}
                          </span>
                        )}
                        {issue.description && <span className="text-[11px] text-slate-400">{issue.description}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{issue.assignee || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{issue.reportedBy || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{issue.dueDate || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <PriorityBadge priority={issue.priority} />
                        <select
                          value={issue.priority}
                          disabled={busy}
                          onChange={(e) => handlePriorityChange(issue, e.target.value as IssuePriority)}
                          className="rounded border border-slate-200 px-1 py-0.5 text-[11px]"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={issue.status} />
                        <select
                          value={issue.status}
                          disabled={busy}
                          onChange={(e) => handleStatusChange(issue, e.target.value as IssueStatus)}
                          className="rounded border border-slate-200 px-1 py-0.5 text-[11px]"
                        >
                          <option value="open">Open</option>
                          <option value="in-progress">In progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(issue)}
                        disabled={busy}
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label="Delete issue"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-xs text-slate-400">
                    {issues.length === 0 ? "No issues reported yet." : "No issues match your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
