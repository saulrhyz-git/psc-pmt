"use client";

/**
 * components/pm/ResourceManagement.tsx
 * -----------------------------------------------------------------------------
 * Crew allocation cards + equipment status table, each with an inline
 * add-form and per-row status/allocation quick edits + delete.
 * -----------------------------------------------------------------------------
 */

import { useState, type FormEvent } from "react";
import { AlertTriangle, Loader2, Plus, Trash2, Truck, Users, X } from "lucide-react";
import type {
  CreateCrewMemberBody,
  CreateEquipmentBody,
  CrewMember,
  CrewMemberResponseBody,
  CrewStatus,
  Equipment,
  EquipmentResponseBody,
  EquipmentStatus,
} from "@/lib/project-types";
import StatusBadge from "@/components/pm/StatusBadge";

interface ResourceManagementProps {
  projectId: string;
  crew: CrewMember[];
  equipment: Equipment[];
  onChanged: () => void;
}

export default function ResourceManagement({ projectId, crew, equipment, onChanged }: ResourceManagementProps) {
  return (
    <div className="flex flex-col gap-8">
      <CrewSection projectId={projectId} crew={crew} onChanged={onChanged} />
      <EquipmentSection projectId={projectId} equipment={equipment} onChanged={onChanged} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Crew
// -----------------------------------------------------------------------------

const EMPTY_CREW_FORM: CreateCrewMemberBody = { name: "", role: "", allocationPercent: 100, status: "active", notes: "" };

function CrewSection({
  projectId,
  crew,
  onChanged,
}: {
  projectId: string;
  crew: CrewMember[];
  onChanged: () => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<CreateCrewMemberBody>(EMPTY_CREW_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/crew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await res.json()) as CrewMemberResponseBody;
      if (!res.ok || !payload.success) throw new Error(payload.error || "Failed to add crew member.");
      setForm(EMPTY_CREW_FORM);
      setShowAddForm(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add crew member.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(member: CrewMember, status: CrewStatus) {
    setBusyId(member.id);
    try {
      await fetch(`/api/projects/${projectId}/crew/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(member: CrewMember) {
    if (!window.confirm(`Remove "${member.name}" from this project's crew?`)) return;
    setBusyId(member.id);
    try {
      await fetch(`/api/projects/${projectId}/crew/${member.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Users className="h-4 w-4 text-slate-400" />
          Crew Allocation
        </h3>
        <button
          type="button"
          onClick={() => setShowAddForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showAddForm ? "Cancel" : "Add Crew"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Name"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              required
              type="text"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              placeholder="Role (e.g. Foreman)"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={form.allocationPercent}
              onChange={(e) => setForm((f) => ({ ...f, allocationPercent: Number(e.target.value) }))}
              placeholder="Allocation %"
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
            Save Crew Member
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {crew.map((member) => {
          const busy = busyId === member.id;
          return (
            <div key={member.id} className={["rounded-xl border border-slate-200 p-3", busy ? "opacity-50" : ""].join(" ")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(member)}
                  disabled={busy}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Remove crew member"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: `${member.allocationPercent}%` }} />
                </div>
                <span className="text-[11px] text-slate-400">{member.allocationPercent}%</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <StatusBadge status={member.status} />
                <select
                  value={member.status}
                  disabled={busy}
                  onChange={(e) => handleStatusChange(member, e.target.value as CrewStatus)}
                  className="rounded border border-slate-200 px-1 py-0.5 text-[11px]"
                >
                  <option value="active">Active</option>
                  <option value="on-leave">On leave</option>
                  <option value="off-project">Off project</option>
                </select>
              </div>
            </div>
          );
        })}
        {crew.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            No crew assigned yet.
          </p>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Equipment
// -----------------------------------------------------------------------------

const EMPTY_EQUIPMENT_FORM: CreateEquipmentBody = { name: "", equipmentType: "", status: "available", assignedTo: "", notes: "" };

function EquipmentSection({
  projectId,
  equipment,
  onChanged,
}: {
  projectId: string;
  equipment: Equipment[];
  onChanged: () => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<CreateEquipmentBody>(EMPTY_EQUIPMENT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/equipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await res.json()) as EquipmentResponseBody;
      if (!res.ok || !payload.success) throw new Error(payload.error || "Failed to add equipment.");
      setForm(EMPTY_EQUIPMENT_FORM);
      setShowAddForm(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add equipment.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(item: Equipment, status: EquipmentStatus) {
    setBusyId(item.id);
    try {
      await fetch(`/api/projects/${projectId}/equipment/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: Equipment) {
    if (!window.confirm(`Remove "${item.name}" from this project's equipment?`)) return;
    setBusyId(item.id);
    try {
      await fetch(`/api/projects/${projectId}/equipment/${item.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Truck className="h-4 w-4 text-slate-400" />
          Equipment Status
        </h3>
        <button
          type="button"
          onClick={() => setShowAddForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showAddForm ? "Cancel" : "Add Equipment"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Equipment name"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              required
              type="text"
              value={form.equipmentType}
              onChange={(e) => setForm((f) => ({ ...f, equipmentType: e.target.value }))}
              placeholder="Type (e.g. Excavator)"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <input
              type="text"
              value={form.assignedTo}
              onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
              placeholder="Assigned to (optional)"
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
            Save Equipment
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Assigned To</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {equipment.map((item) => {
              const busy = busyId === item.id;
              return (
                <tr key={item.id} className={busy ? "opacity-50" : undefined}>
                  <td className="px-3 py-2 font-medium text-slate-700">{item.name}</td>
                  <td className="px-3 py-2 text-slate-500">{item.equipmentType}</td>
                  <td className="px-3 py-2 text-slate-500">{item.assignedTo || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={item.status} />
                      <select
                        value={item.status}
                        disabled={busy}
                        onChange={(e) => handleStatusChange(item, e.target.value as EquipmentStatus)}
                        className="rounded border border-slate-200 px-1 py-0.5 text-[11px]"
                      >
                        <option value="available">Available</option>
                        <option value="in-use">In use</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="reserved">Reserved</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      disabled={busy}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove equipment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {equipment.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-400">
                  No equipment tracked yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
