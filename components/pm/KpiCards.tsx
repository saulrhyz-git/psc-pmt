"use client";

/**
 * components/pm/KpiCards.tsx
 * -----------------------------------------------------------------------------
 * Dashboard KPI strip: active tasks, overall progress, budget burn, crew
 * count. Pure display component — all math happens in lib/project-kpi-utils.ts.
 * -----------------------------------------------------------------------------
 */

import { Activity, DollarSign, TrendingUp, Users } from "lucide-react";
import type { ProjectKpis } from "@/lib/project-types";
import { formatCurrency } from "@/lib/currency-utils";

export default function KpiCards({ kpis }: { kpis: ProjectKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        icon={Activity}
        label="Active Tasks"
        value={String(kpis.activeTaskCount)}
        accent="text-sky-600 bg-sky-50"
      />
      <KpiCard
        icon={TrendingUp}
        label="Overall Progress"
        value={`${kpis.overallProgressPercent}%`}
        accent="text-emerald-600 bg-emerald-50"
      />
      <KpiCard
        icon={DollarSign}
        label="Budget Burn"
        value={`${kpis.budgetBurnPercent}%`}
        subtext={`${formatCurrency(kpis.totalSpent, { decimals: false })} / ${formatCurrency(kpis.totalBudgeted, { decimals: false })}`}
        accent={
          kpis.budgetBurnPercent > 100
            ? "text-red-600 bg-red-50"
            : kpis.budgetBurnPercent > 85
              ? "text-amber-600 bg-amber-50"
              : "text-indigo-600 bg-indigo-50"
        }
      />
      <KpiCard icon={Users} label="Crew Count" value={String(kpis.crewCount)} accent="text-violet-600 bg-violet-50" />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  subtext,
  accent,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  subtext?: string;
  accent: string;
}) {
  const [textClass, bgClass] = accent.split(" ");
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4">
      <div className={["flex h-8 w-8 items-center justify-center rounded-lg", bgClass].join(" ")}>
        <Icon className={["h-4 w-4", textClass].join(" ")} />
      </div>
      <div>
        <p className="text-lg font-bold text-slate-800">{value}</p>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        {subtext && <p className="mt-0.5 text-[11px] text-slate-400">{subtext}</p>}
      </div>
    </div>
  );
}
