"use client";

/**
 * components/pm/BudgetTracker.tsx
 * -----------------------------------------------------------------------------
 * Total spend vs. budget, plus a phase-by-phase breakdown of budget line
 * items (category, budgeted, spent, remaining) with add/edit/delete.
 * -----------------------------------------------------------------------------
 */

import { useState, type FormEvent } from "react";
import { AlertTriangle, Loader2, Plus, Trash2, X } from "lucide-react";
import type {
  BudgetCategory,
  BudgetLineItem,
  BudgetLineItemResponseBody,
  CreateBudgetLineItemBody,
  Project,
} from "@/lib/project-types";
import { getPhaseColor } from "@/components/pm/phase-colors";

interface BudgetTrackerProps {
  projectId: string;
  project: Project;
  lineItems: BudgetLineItem[];
  onChanged: () => void;
}

const CATEGORY_OPTIONS: BudgetCategory[] = ["labor", "materials", "equipment", "permits", "subcontractor", "contingency", "other"];

const EMPTY_FORM: CreateBudgetLineItemBody = {
  phase: "",
  category: "materials",
  budgeted: 0,
  spent: 0,
  description: "",
};

export default function BudgetTracker({ projectId, project, lineItems, onChanged }: BudgetTrackerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<CreateBudgetLineItemBody>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const totalBudgeted = lineItems.reduce((sum, b) => sum + b.budgeted, 0);
  const totalSpent = lineItems.reduce((sum, b) => sum + b.spent, 0);
  const burnPercent = project.totalBudget > 0 ? Math.round((totalSpent / project.totalBudget) * 100) : 0;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await res.json()) as BudgetLineItemResponseBody;
      if (!res.ok || !payload.success) throw new Error(payload.error || "Failed to add budget line item.");
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add budget line item.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSpentChange(item: BudgetLineItem, spent: number) {
    setBusyId(item.id);
    try {
      await fetch(`/api/projects/${projectId}/budget/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spent }),
      });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: BudgetLineItem) {
    if (!window.confirm(`Delete budget line item for "${item.phase}"?`)) return;
    setBusyId(item.id);
    try {
      await fetch(`/api/projects/${projectId}/budget/${item.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-800">
            ${totalSpent.toLocaleString()} spent of ${project.totalBudget.toLocaleString()} total budget
          </span>
          <span
            className={[
              "font-semibold",
              burnPercent > 100 ? "text-red-600" : burnPercent > 85 ? "text-amber-600" : "text-emerald-600",
            ].join(" ")}
          >
            {burnPercent}%
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={[
              "h-full rounded-full transition-all",
              burnPercent > 100 ? "bg-red-500" : burnPercent > 85 ? "bg-amber-500" : "bg-emerald-500",
            ].join(" ")}
            style={{ width: `${Math.min(burnPercent, 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Allocated across line items: ${totalBudgeted.toLocaleString()}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Phase-by-Phase Breakdown</h3>
        <button
          type="button"
          onClick={() => setShowAddForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showAddForm ? "Cancel" : "Add Line Item"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input
              required
              type="text"
              value={form.phase}
              onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}
              placeholder="Phase (e.g. Framing)"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as BudgetCategory }))}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              min={0}
              step="0.01"
              value={form.budgeted}
              onChange={(e) => setForm((f) => ({ ...f, budgeted: Number(e.target.value) }))}
              placeholder="Budgeted ($)"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.spent}
              onChange={(e) => setForm((f) => ({ ...f, spent: Number(e.target.value) }))}
              placeholder="Spent so far ($)"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Description (optional)"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
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
            Save Line Item
          </button>
        </form>
      )}

      <div className="flex flex-col gap-2">
        {lineItems.map((item) => {
          const color = getPhaseColor(item.phase);
          const pct = item.budgeted > 0 ? Math.min(Math.round((item.spent / item.budgeted) * 100), 999) : 0;
          const busy = busyId === item.id;
          return (
            <div key={item.id} className={["rounded-lg border border-slate-200 p-3", busy ? "opacity-50" : ""].join(" ")}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={["rounded-full px-2 py-0.5 text-[11px] font-medium", color.chip].join(" ")}>
                    {item.phase}
                  </span>
                  <span className="text-[11px] text-slate-400">{item.category}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={busy}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Delete line item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {item.description && <p className="mt-1 text-xs text-slate-500">{item.description}</p>}
              <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                <span>Budgeted: ${item.budgeted.toLocaleString()}</span>
                <span className="flex items-center gap-1">
                  Spent:
                  <input
                    type="number"
                    min={0}
                    disabled={busy}
                    value={item.spent}
                    onChange={(e) => handleSpentChange(item, Number(e.target.value))}
                    className="w-20 rounded border border-slate-200 px-1 py-0.5"
                  />
                </span>
                <span>Remaining: ${(item.budgeted - item.spent).toLocaleString()}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={["h-full rounded-full", pct > 100 ? "bg-red-500" : color.bar].join(" ")}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
        {lineItems.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            No budget line items yet.
          </p>
        )}
      </div>
    </div>
  );
}
