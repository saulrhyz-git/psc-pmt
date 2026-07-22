/**
 * lib/cost-settings.ts
 * -----------------------------------------------------------------------------
 * Admin-configured default unit costs for the Material/Cost Estimator
 * (components/MaterialEstimator.tsx). Lets an admin set the starting
 * paint/drywall/flooring/trim/labor rates and contingency % that every user
 * sees when they first open the estimator for a plan, instead of everyone
 * starting from the hardcoded placeholder values in lib/estimate-utils.ts.
 *
 * Storage: the singleton `CostEstimateDefaults` row (id = 1) in Postgres —
 * see prisma/schema.prisma. Same "singleton row, lazily created, individual
 * fields nullable and fall back independently" pattern as lib/ai-settings.ts.
 * A field left unset (null) falls back to DEFAULT_UNIT_COST_SETTINGS.
 *
 * Access control: admin-only to write (see requireAdmin in the route handler
 * — this mirrors AI Provider Settings, since these are shared, app-wide
 * defaults, not a per-user preference). Every signed-in user can still edit
 * their own session's numbers live in MaterialEstimator; only the *starting
 * point* is admin-controlled. Note: this is a placeholder for real RBAC —
 * once role-based permissions are built out, this may become configurable by
 * additional roles.
 *
 * Server-only: this file uses the Prisma client and must never be imported
 * from a Client Component.
 * -----------------------------------------------------------------------------
 */

import { prisma } from "./prisma";
import type { UnitCostSettings } from "./types";
import { DEFAULT_UNIT_COST_SETTINGS } from "./estimate-utils";

const SETTINGS_ROW_ID = 1;

/**
 * Reads the singleton row and merges it over DEFAULT_UNIT_COST_SETTINGS,
 * field by field. A missing row or a null field is treated as "not
 * customized yet" and falls back to the code default — this store is a
 * convenience layer, not a critical-path dependency, so it should degrade
 * gracefully rather than throwing.
 */
export async function getCostEstimateDefaults(): Promise<UnitCostSettings> {
  const row = await prisma.costEstimateDefaults.findUnique({ where: { id: SETTINGS_ROW_ID } });
  if (!row) return { ...DEFAULT_UNIT_COST_SETTINGS };

  return {
    paintPerSqM: row.paintPerSqM ?? DEFAULT_UNIT_COST_SETTINGS.paintPerSqM,
    drywallPerSqM: row.drywallPerSqM ?? DEFAULT_UNIT_COST_SETTINGS.drywallPerSqM,
    flooringPerSqM: row.flooringPerSqM ?? DEFAULT_UNIT_COST_SETTINGS.flooringPerSqM,
    trimPerLinearM: row.trimPerLinearM ?? DEFAULT_UNIT_COST_SETTINGS.trimPerLinearM,
    laborRatePerHour: row.laborRatePerHour ?? DEFAULT_UNIT_COST_SETTINGS.laborRatePerHour,
    laborHoursPerSqM: row.laborHoursPerSqM ?? DEFAULT_UNIT_COST_SETTINGS.laborHoursPerSqM,
    contingencyPercent: row.contingencyPercent ?? DEFAULT_UNIT_COST_SETTINGS.contingencyPercent,
  };
}

/**
 * Merges a partial update into the stored defaults and persists it, then
 * returns the fully-resolved settings (same shape as getCostEstimateDefaults).
 * Only keys present in `update` are touched; omitted keys keep whatever was
 * already stored (or the code default, if never set).
 */
export async function updateCostEstimateDefaults(update: Partial<UnitCostSettings>): Promise<UnitCostSettings> {
  const data: Record<string, number> = {};
  for (const key of Object.keys(update) as (keyof UnitCostSettings)[]) {
    const value = update[key];
    if (value === undefined) continue;
    data[key] = value;
  }

  await prisma.costEstimateDefaults.upsert({
    where: { id: SETTINGS_ROW_ID },
    update: data,
    create: { id: SETTINGS_ROW_ID, ...data },
  });

  return getCostEstimateDefaults();
}
