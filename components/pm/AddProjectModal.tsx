"use client";

/**
 * components/pm/AddProjectModal.tsx
 * -----------------------------------------------------------------------------
 * Modal form for creating a new construction project. POSTs to /api/projects.
 * -----------------------------------------------------------------------------
 */

import { useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import type { CreateProjectBody, Project, ProjectResponseBody, ProjectStatus } from "@/lib/project-types";

interface AddProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

const EMPTY_FORM: CreateProjectBody = {
  name: "",
  projectInCharge: "",
  clientName: "",
  dateStarted: new Date().toISOString().slice(0, 10),
  targetCompletionDate: "",
  address: "",
  projectType: "",
  totalBudget: 0,
  status: "planning",
  notes: "",
};

export default function AddProjectModal({ open, onClose, onCreated }: AddProjectModalProps) {
  const [form, setForm] = useState<CreateProjectBody>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          targetCompletionDate: form.targetCompletionDate || undefined,
          address: form.address || undefined,
          projectType: form.projectType || undefined,
          notes: form.notes || undefined,
          totalBudget: Number(form.totalBudget) || 0,
        }),
      });
      const payload = (await res.json()) as ProjectResponseBody;
      if (!res.ok || !payload.success || !payload.project) {
        throw new Error(payload.error || "Failed to create project.");
      }
      onCreated(payload.project);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-project-title"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="add-project-title" className="text-sm font-semibold text-slate-800">
            New Project
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Project Name" required className="sm:col-span-2">
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Roberts Residence Remodel"
              />
            </Field>

            <Field label="Project In Charge" required>
              <input
                required
                type="text"
                value={form.projectInCharge}
                onChange={(e) => setForm((f) => ({ ...f, projectInCharge: e.target.value }))}
                className={inputClass}
                placeholder="e.g. J. Roberts"
              />
            </Field>

            <Field label="Client Name" required>
              <input
                required
                type="text"
                value={form.clientName}
                onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                className={inputClass}
              />
            </Field>

            <Field label="Date Started" required>
              <input
                required
                type="date"
                value={form.dateStarted}
                onChange={(e) => setForm((f) => ({ ...f, dateStarted: e.target.value }))}
                className={inputClass}
              />
            </Field>

            <Field label="Target Completion">
              <input
                type="date"
                value={form.targetCompletionDate}
                onChange={(e) => setForm((f) => ({ ...f, targetCompletionDate: e.target.value }))}
                className={inputClass}
              />
            </Field>

            <Field label="Project Type">
              <input
                type="text"
                value={form.projectType}
                onChange={(e) => setForm((f) => ({ ...f, projectType: e.target.value }))}
                className={inputClass}
                placeholder="e.g. Residential Remodel"
              />
            </Field>

            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProjectStatus }))}
                className={inputClass}
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on-hold">On hold</option>
                <option value="completed">Completed</option>
              </select>
            </Field>

            <Field label="Total Budget ($)" required>
              <input
                required
                type="number"
                min={0}
                step="0.01"
                value={form.totalBudget}
                onChange={(e) => setForm((f) => ({ ...f, totalBudget: Number(e.target.value) }))}
                className={inputClass}
              />
            </Field>

            <Field label="Address" className="sm:col-span-2">
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className={inputClass}
              />
            </Field>

            <Field label="Notes" className="sm:col-span-2">
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className={[inputClass, "min-h-[60px] resize-y"].join(" ")}
                placeholder="Anything else worth noting about this project"
              />
            </Field>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create Project
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400";

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={["flex flex-col gap-1", className ?? ""].join(" ")}>
      <span className="text-xs font-medium text-slate-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
