"use client";

/**
 * components/pm/BudgetTracker.tsx
 * -----------------------------------------------------------------------------
 * Total spend vs. budget, plus a phase-by-phase breakdown of budget line
 * items (category, budgeted, spent, remaining) with add/edit/delete.
 * -----------------------------------------------------------------------------
 */

import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Layers, Loader2, Plus, Trash2, X } from "lucide-react";
import type {
  BudgetCategory,
  BudgetLineItem,
  BudgetLineItemResponseBody,
  BudgetListResponseBody,
  CreateBudgetLineItemBody,
  Project,
} from "@/lib/project-types";
import type { BudgetTemplate, BudgetTemplatesListResponseBody } from "@/lib/template-types";
import { getPhaseColor } from "@/components/pm/phase-colors";
import { CURRENCY_SYMBOL, formatCurrency } from "@/lib/currency-utils";

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

  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const totalBudgeted = lineItems.reduce((sum, b) => sum + b.budgeted, 0);
  const totalSpent = lineItems.reduce((sum, b) => sum + b.spent, 0);
  const burnPercent = project.totalBudget > 0 ? Math.round((totalSpent / project.totalBudget) * 100) : 0;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/templates/budget");
        const payload = (await res.json()) as BudgetTemplatesListResponseBody;
        if (res.ok && payload.success && payload.templates) setTemplates(payload.templates);
      } catch {
        // Non-critical — "Apply Template" just won't have options if this fails.
      }
    })();
  }, []);

  async function handleApplyTemplate() {
    if (!selectedTemplateId) return;
    setApplyingTemplate(true);
    setTemplateError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget/apply-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplateId }),
      });
      const payload = (await res.json()) as BudgetListResponseBody;
      if (!res.ok || !payload.success) throw new Error(payload.error || "Failed to apply template.");
      setSelectedTemplateId("");
      onChanged();
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Failed to apply template.");
    } finally {
      setApplyingTemplate(false);
    }
  }

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
            {formatCurrency(totalSpent, { decimals: false })} spent of {formatCurrency(project.totalBudget, { decimals: false })} total budget
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
          Allocated across line items: {formatCurrency(totalBudgeted, { decimals: false })}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Phase-by-Phase Breakdown</h3>
        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">Use a template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyTemplate}
                disabled={!selectedTemplateId || applyingTemplate}
                className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {applyingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                Apply
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowAddForm((s) => !s)}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showAddForm ? "Cancel" : "Add Line Item"}
          </button>
        </div>
      </div>

      {templateError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{templateError}</span>
        </div>
      )}

      {templates.length === 0 && (
        <p className="text-[11px] text-slate-400">
          No budget templates yet — create one under Settings &amp; Templates to speed up repetitive project setups.
        </p>
      )}

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
              placeholder={`Budgeted (${CURRENCY_SYMBOL})`}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.spent}
              onChange={(e) => setForm((f) => ({ ...f, spent: Number(e.target.value) }))}
              placeholder={`Spent so far (${CURRENCY_SYMBOL})`}
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
                <span>Budgeted: {formatCurrency(item.budgeted, { decimals: false })}</span>
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
                <span>Remaining: {formatCurrency(item.budgeted - item.spent, { decimals: false })}</span>
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
