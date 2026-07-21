/**
 * lib/project-kpi-utils.ts
 * -----------------------------------------------------------------------------
 * Pure, dependency-free KPI math over a ProjectBundle. No fs/SDK imports, so
 * it's safe to import directly into Client Components (the dashboard
 * recomputes KPIs instantly after any local edit, without a round-trip) and
 * is also used server-side by the export route for consistency.
 * -----------------------------------------------------------------------------
 */

import type { ProjectBundle, ProjectKpis } from "./project-types";

export function computeProjectKpis(bundle: ProjectBundle): ProjectKpis {
  const { tasks, budgetLineItems, crew } = bundle;

  const activeTaskCount = tasks.filter((t) => t.status === "in-progress").length;

  const overallProgressPercent =
    tasks.length === 0 ? 0 : Math.round(tasks.reduce((sum, t) => sum + t.progressPercent, 0) / tasks.length);

  const totalBudgeted = budgetLineItems.reduce((sum, b) => sum + b.budgeted, 0);
  const totalSpent = budgetLineItems.reduce((sum, b) => sum + b.spent, 0);
  const budgetBurnPercent = totalBudgeted === 0 ? 0 : Math.round((totalSpent / totalBudgeted) * 100);

  const crewCount = crew.filter((c) => c.status === "active").length;

  return {
    activeTaskCount,
    overallProgressPercent,
    totalBudgeted,
    totalSpent,
    budgetBurnPercent,
    crewCount,
  };
}
