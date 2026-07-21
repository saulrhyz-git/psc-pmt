/**
 * components/pm/StatusBadge.tsx
 * -----------------------------------------------------------------------------
 * Small colored pill for status enums used across Project Management
 * (task/project/crew/equipment status). Centralized so the same status value
 * always renders the same color everywhere.
 * -----------------------------------------------------------------------------
 */

const STATUS_STYLES: Record<string, string> = {
  // Task status
  "not-started": "bg-slate-100 text-slate-600",
  "in-progress": "bg-sky-100 text-sky-700",
  blocked: "bg-red-100 text-red-700",
  completed: "bg-emerald-100 text-emerald-700",
  // Project status
  planning: "bg-slate-100 text-slate-600",
  active: "bg-sky-100 text-sky-700",
  "on-hold": "bg-amber-100 text-amber-700",
  // Crew status
  "on-leave": "bg-amber-100 text-amber-700",
  "off-project": "bg-slate-100 text-slate-500",
  // Equipment status
  available: "bg-emerald-100 text-emerald-700",
  "in-use": "bg-sky-100 text-sky-700",
  maintenance: "bg-red-100 text-red-700",
  reserved: "bg-amber-100 text-amber-700",
};

const STATUS_LABELS: Record<string, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  blocked: "Blocked",
  completed: "Completed",
  planning: "Planning",
  active: "Active",
  "on-hold": "On hold",
  "on-leave": "On leave",
  "off-project": "Off project",
  available: "Available",
  "in-use": "In use",
  maintenance: "Maintenance",
  reserved: "Reserved",
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={[
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600",
      ].join(" ")}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
