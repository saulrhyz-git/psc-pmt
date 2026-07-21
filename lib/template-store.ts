/**
 * lib/template-store.ts
 * -----------------------------------------------------------------------------
 * Server-only persistence for templates (currently just Budget templates).
 * Same pattern as lib/auth.ts / lib/project-store.ts: a single local,
 * gitignored JSON file (`.budget-templates.local.json`), read fresh and
 * written back on every mutation. No database.
 *
 * Uses `node:fs`/`node:crypto` — must never be imported into a `"use client"`
 * component. Import only from Route Handlers (app/api/templates/**) and
 * other server-only modules.
 * -----------------------------------------------------------------------------
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { BudgetTemplate, BudgetTemplateLineItem, CreateBudgetTemplateBody, UpdateBudgetTemplateBody } from "./template-types";

const DATA_FILE = path.join(process.cwd(), ".budget-templates.local.json");

interface Store {
  budgetTemplates: BudgetTemplate[];
}

function loadStore(): Store {
  if (!fs.existsSync(DATA_FILE)) return { budgetTemplates: [] };
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    return { budgetTemplates: parsed.budgetTemplates ?? [] };
  } catch {
    return { budgetTemplates: [] };
  }
}

function saveStore(store: Store): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), { encoding: "utf-8", mode: 0o600 });
}

export interface StoreResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function ok<T>(data: T): StoreResult<T> {
  return { success: true, data };
}

function fail<T>(error: string): StoreResult<T> {
  return { success: false, error };
}

function validateLineItems(lineItems: BudgetTemplateLineItem[] | undefined): string | null {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return "At least one line item is required.";
  }
  for (const item of lineItems) {
    if (!item.phase?.trim()) return "Every line item needs a phase.";
    if (!item.category) return "Every line item needs a category.";
    if (typeof item.budgeted !== "number" || item.budgeted < 0) {
      return "Every line item's budgeted amount must be a non-negative number.";
    }
  }
  return null;
}

export function listBudgetTemplates(): BudgetTemplate[] {
  return loadStore().budgetTemplates.sort((a, b) => a.name.localeCompare(b.name));
}

export function getBudgetTemplate(id: string): BudgetTemplate | null {
  return loadStore().budgetTemplates.find((t) => t.id === id) ?? null;
}

export function createBudgetTemplate(body: CreateBudgetTemplateBody): StoreResult<BudgetTemplate> {
  if (!body.name?.trim()) return fail("Template name is required.");
  const lineItemsError = validateLineItems(body.lineItems);
  if (lineItemsError) return fail(lineItemsError);

  const now = new Date().toISOString();
  const template: BudgetTemplate = {
    id: randomUUID(),
    name: body.name.trim(),
    description: body.description?.trim() || undefined,
    lineItems: body.lineItems.map((li) => ({
      phase: li.phase.trim(),
      category: li.category,
      description: li.description?.trim() || undefined,
      budgeted: li.budgeted,
    })),
    createdAt: now,
    updatedAt: now,
  };

  const store = loadStore();
  store.budgetTemplates.push(template);
  saveStore(store);
  return ok(template);
}

export function updateBudgetTemplate(id: string, body: UpdateBudgetTemplateBody): StoreResult<BudgetTemplate> {
  const store = loadStore();
  const template = store.budgetTemplates.find((t) => t.id === id);
  if (!template) return fail(`Template "${id}" not found.`);

  if (body.lineItems !== undefined) {
    const lineItemsError = validateLineItems(body.lineItems);
    if (lineItemsError) return fail(lineItemsError);
  }

  Object.assign(template, {
    ...(body.name !== undefined && { name: body.name.trim() }),
    ...(body.description !== undefined && { description: body.description.trim() || undefined }),
    ...(body.lineItems !== undefined && {
      lineItems: body.lineItems.map((li) => ({
        phase: li.phase.trim(),
        category: li.category,
        description: li.description?.trim() || undefined,
        budgeted: li.budgeted,
      })),
    }),
    updatedAt: new Date().toISOString(),
  });

  saveStore(store);
  return ok(template);
}

export function deleteBudgetTemplate(id: string): StoreResult<true> {
  const store = loadStore();
  const before = store.budgetTemplates.length;
  store.budgetTemplates = store.budgetTemplates.filter((t) => t.id !== id);
  if (store.budgetTemplates.length === before) return fail(`Template "${id}" not found.`);
  saveStore(store);
  return ok(true);
}
