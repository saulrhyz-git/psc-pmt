"use client";

/**
 * components/pm/TaskList.tsx
 * -----------------------------------------------------------------------------
 * Searchable, filterable task list with progress bars and status badges.
 * Includes an inline "add task" form and per-row quick edits (status,
 * progress) plus delete. Mutations call the parent's onChanged callback so
 * ProjectManagementTool can refetch the bundle (keeps KPIs/Gantt in sync).
 * -----------------------------------------------------------------------------
 */

import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import type { CreateTaskBody, ProjectTask, TaskPriority, TaskResponseBody, TaskStatus } from "@/lib/project-types";
import StatusBadge from "@/components/pm/StatusBadge";
import { getPhaseColor } from "@/components/pm/phase-colors";

interface TaskListProps {
  projectId: string;
  tasks: ProjectTask[];
  onChanged: () => void;
}

const STATUS_OPTIONS: { value: TaskStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "not-started", label: "Not started" },
  { value: "in-progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
];

const EMPTY_FORM: CreateTaskBody = {
  title: "",
  phase: "",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10),
  assignee: "",
  priority: "medium",
};

export default function TaskList({ projectId, tasks, onChanged }: TaskListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<CreateTaskBody>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const phases = useMemo(() => Array.from(new Set(tasks.map((t) => t.phase))).sort(), [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (phaseFilter !== "all" && t.phase !== phaseFilter) return false;
      if (q && !`${t.title} ${t.assignee ?? ""} ${t.phase}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, search, statusFilter, phaseFilter]);

  async function handleAddTask(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, assignee: form.assignee || undefined }),
      });
      const payload = (await res.json()) as TaskResponseBody;
      if (!res.ok || !payload.success) throw new Error(payload.error || "Failed to add task.");
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add task.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(task: ProjectTask, status: TaskStatus) {
    setBusyTaskId(task.id);
    try {
      await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, progressPercent: status === "completed" ? 100 : task.progressPercent }),
      });
      onChanged();
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleProgressChange(task: ProjectTask, progressPercent: number) {
    setBusyTaskId(task.id);
    try {
      await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progressPercent }),
      });
      onChanged();
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleDelete(task: ProjectTask) {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    setBusyTaskId(task.id);
    try {
      await fetch(`/api/projects/${projectId}/tasks/${task.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, assignee, phase..."
            className="w-full rounded-md border border-slate-200 py-2 pl-8 pr-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "all")}
          className="rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={phaseFilter}
          onChange={(e) => setPhaseFilter(e.target.value)}
          className="rounded-md border border-slate-200 px-2.5 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="all">All phases</option>
          {phases.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowAddForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showAddForm ? "Cancel" : "Add Task"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddTask} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              required
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Task title"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 sm:col-span-2"
            />
            <input
              required
              type="text"
              value={form.phase}
              onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}
              placeholder="Phase (e.g. Framing)"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="text"
              value={form.assignee}
              onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
              placeholder="Assignee (optional)"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
            </select>
            <input
              required
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              required
              type="date"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={saving}
            className="flex w-fit items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Task
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Phase</th>
              <th className="px-3 py-2 font-medium">Assignee</th>
              <th className="px-3 py-2 font-medium">Dates</th>
              <th className="px-3 py-2 font-medium">Progress</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((task) => {
              const phaseColor = getPhaseColor(task.phase);
              const busy = busyTaskId === task.id;
              return (
                <tr key={task.id} className={busy ? "opacity-50" : undefined}>
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-700">{task.title}</p>
                    {task.priority === "high" && <p className="text-[10px] font-medium text-red-500">High priority</p>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={["rounded-full px-2 py-0.5 text-[11px] font-medium", phaseColor.chip].join(" ")}>
                      {task.phase}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{task.assignee || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                    {task.startDate} → {task.endDate}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${task.progressPercent}%` }}
                        />
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={task.progressPercent}
                        disabled={busy}
                        onChange={(e) => handleProgressChange(task, Number(e.target.value))}
                        className="w-12 rounded border border-slate-200 px-1 py-0.5 text-xs"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={task.status} />
                      <select
                        value={task.status}
                        disabled={busy}
                        onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                        className="rounded border border-slate-200 px-1 py-0.5 text-[11px]"
                      >
                        <option value="not-started">Not started</option>
                        <option value="in-progress">In progress</option>
                        <option value="blocked">Blocked</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(task)}
                      disabled={busy}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label="Delete task"
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
                  No tasks match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
