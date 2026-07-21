"use client";

/**
 * components/settings-templates/BudgetTemplateManager.tsx
 * -----------------------------------------------------------------------------
 * Create, edit, and delete reusable Budget templates — a saved set of
 * phase/category/amount line items that can be applied in one click to any
 * project's Budget tab (see components/pm/BudgetTracker.tsx's "Apply
 * Template" control). Handy for repetitive project types, e.g. every
 * "Kitchen Remodel" starts from the same rough budget skeleton.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, Layers, Loader2, Plus, Trash2, X } from "lucide-react";
import type {
  BudgetTemplate,
  BudgetTemplateLineItem,
  BudgetTemplateResponseBody,
  BudgetTemplatesListResponseBody,
  CreateBudgetTemplateBody,
} from "@/lib/template-types";
import type { BudgetCategory } from "@/lib/project-types";
import { CURRENCY_SYMBOL, formatCurrency } from "@/lib/currency-utils";

const CATEGORY_OPTIONS: BudgetCategory[] = ["labor", "materials", "equipment", "permits", "subcontractor", "contingency", "other"];

const EMPTY_LINE_ITEM: BudgetTemplateLineItem = { phase: "", category: "materials", budgeted: 0, description: "" };

export default function BudgetTemplateManager() {
  const [templates, setTemplates] = useState<BudgetTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/templates/budget");
      const payload = (await res.json()) as BudgetTemplatesListResponseBody;
      if (!res.ok || !payload.success || !payload.templates) {
        throw new Error(payload.error || "Failed to load budget templates.");
      }
      setTemplates(payload.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load budget templates.");
    }
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  async function handleDelete(template: BudgetTemplate) {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;
    setBusyId(template.id);
    try {
      await fetch(`/api/templates/budget/${template.id}`, { method: "DELETE" });
      await fetchTemplates();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Layers className="h-4 w-4 text-slate-400" />
            Budget Templates
          </h3>
          <p className="text-xs text-slate-500">
            Pre-make a phase-by-phase budget skeleton to reuse across similar projects.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          {showCreateForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showCreateForm ? "Cancel" : "New Template"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {showCreateForm && (
        <TemplateForm
          onCancel={() => setShowCreateForm(false)}
          onSaved={() => {
            setShowCreateForm(false);
            void fetchTemplates();
          }}
        />
      )}

      {templates === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading templates...
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((template) => {
            const total = template.lineItems.reduce((sum, li) => sum + li.budgeted, 0);
            const busy = busyId === template.id;
            return (
              <div key={template.id} className={["rounded-xl border border-slate-200 p-4", busy ? "opacity-50" : ""].join(" ")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{template.name}</p>
                    {template.description && <p className="text-xs text-slate-500">{template.description}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(template)}
                    disabled={busy}
                    className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete template"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {template.lineItems.map((li, i) => (
                    <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {li.phase} · {formatCurrency(li.budgeted, { decimals: false })}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Total: {formatCurrency(total, { decimals: false })} across {template.lineItems.length} line item
                  {template.lineItems.length === 1 ? "" : "s"}
                </p>
              </div>
            );
          })}
          {templates.length === 0 && !showCreateForm && (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
              No budget templates yet. Create one to reuse across similar projects.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Create form
// -----------------------------------------------------------------------------

function TemplateForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lineItems, setLineItems] = useState<BudgetTemplateLineItem[]>([{ ...EMPTY_LINE_ITEM }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLineItem(index: number, patch: Partial<BudgetTemplateLineItem>) {
    setLineItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addLineItem() {
    setLineItems((items) => [...items, { ...EMPTY_LINE_ITEM }]);
  }

  function removeLineItem(index: number) {
    setLineItems((items) => items.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: CreateBudgetTemplateBody = {
        name,
        description: description || undefined,
        lineItems: lineItems.filter((li) => li.phase.trim()),
      };
      const res = await fetch("/api/templates/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as BudgetTemplateResponseBody;
      if (!res.ok || !payload.success) throw new Error(payload.error || "Failed to save template.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          required
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name (e.g. Kitchen Remodel Budget)"
          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-slate-500">Line items</span>
        {lineItems.map((item, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1.5fr_1fr_auto]">
            <input
              type="text"
              value={item.phase}
              onChange={(e) => updateLineItem(i, { phase: e.target.value })}
              placeholder="Phase (e.g. Framing)"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <select
              value={item.category}
              onChange={(e) => updateLineItem(i, { category: e.target.value as BudgetCategory })}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step="0.01"
              value={item.budgeted}
              onChange={(e) => updateLineItem(i, { budgeted: Number(e.target.value) })}
              placeholder={`Budgeted (${CURRENCY_SYMBOL})`}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              type="button"
              onClick={() => removeLineItem(i)}
              disabled={lineItems.length === 1}
              className="flex items-center justify-center rounded-md border border-slate-200 p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Remove line item"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addLineItem}
          className="flex w-fit items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
        >
          <Plus className="h-3 w-3" />
          Add line item
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save Template
        </button>
      </div>
    </form>
  );
}
