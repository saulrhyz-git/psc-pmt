/**
 * lib/template-store.ts
 * -----------------------------------------------------------------------------
 * Server-only persistence for templates (currently just Budget templates).
 *
 * Storage: Postgres via Prisma (see prisma/schema.prisma's `BudgetTemplate`
 * and `BudgetTemplateLineItem` models). This used to be a single gitignored
 * JSON file (`.budget-templates.local.json`).
 *
 * `BudgetTemplateLineItem` has no app-facing `id` (see the app type in
 * template-types.ts) — `updateBudgetTemplate`'s "replace all line items"
 * semantics from the old JSON version are preserved exactly via a Prisma
 * transaction: delete every existing line item row for the template, then
 * create the new set, both atomically.
 *
 * Uses the Prisma client (real TCP connections to Postgres) — must never be
 * imported into a `"use client"` component. Import only from Route Handlers
 * (app/api/templates/**) and other server-only modules.
 * -----------------------------------------------------------------------------
 */

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { BudgetTemplate, BudgetTemplateLineItem, CreateBudgetTemplateBody, UpdateBudgetTemplateBody } from "./template-types";

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

function isNotFoundError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2025";
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

type BudgetTemplateRow = Prisma.BudgetTemplateGetPayload<{ include: { lineItems: true } }>;

function toBudgetTemplate(row: BudgetTemplateRow): BudgetTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    lineItems: row.lineItems.map((li) => ({
      phase: li.phase,
      category: li.category,
      description: li.description ?? undefined,
      budgeted: li.budgeted.toNumber(),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listBudgetTemplates(): Promise<BudgetTemplate[]> {
  const rows = await prisma.budgetTemplate.findMany({ include: { lineItems: true }, orderBy: { name: "asc" } });
  return rows.map(toBudgetTemplate);
}

export async function getBudgetTemplate(id: string): Promise<BudgetTemplate | null> {
  const row = await prisma.budgetTemplate.findUnique({ where: { id }, include: { lineItems: true } });
  return row ? toBudgetTemplate(row) : null;
}

export async function createBudgetTemplate(body: CreateBudgetTemplateBody): Promise<StoreResult<BudgetTemplate>> {
  if (!body.name?.trim()) return fail("Template name is required.");
  const lineItemsError = validateLineItems(body.lineItems);
  if (lineItemsError) return fail(lineItemsError);

  const row = await prisma.budgetTemplate.create({
    data: {
      id: randomUUID(),
      name: body.name.trim(),
      description: body.description?.trim() || undefined,
      lineItems: {
        create: body.lineItems.map((li) => ({
          id: randomUUID(),
          phase: li.phase.trim(),
          category: li.category,
          description: li.description?.trim() || undefined,
          budgeted: li.budgeted,
        })),
      },
    },
    include: { lineItems: true },
  });
  return ok(toBudgetTemplate(row));
}

export async function updateBudgetTemplate(id: string, body: UpdateBudgetTemplateBody): Promise<StoreResult<BudgetTemplate>> {
  const existing = await prisma.budgetTemplate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return fail(`Template "${id}" not found.`);

  if (body.lineItems !== undefined) {
    const lineItemsError = validateLineItems(body.lineItems);
    if (lineItemsError) return fail(lineItemsError);
  }

  try {
    const row = await prisma.$transaction(async (tx) => {
      if (body.lineItems !== undefined) {
        await tx.budgetTemplateLineItem.deleteMany({ where: { templateId: id } });
      }
      return tx.budgetTemplate.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name.trim() }),
          ...(body.description !== undefined && { description: body.description.trim() || null }),
          ...(body.lineItems !== undefined && {
            lineItems: {
              create: body.lineItems.map((li) => ({
                id: randomUUID(),
                phase: li.phase.trim(),
                category: li.category,
                description: li.description?.trim() || undefined,
                budgeted: li.budgeted,
              })),
            },
          }),
        },
        include: { lineItems: true },
      });
    });
    return ok(toBudgetTemplate(row));
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Template "${id}" not found.`);
    throw err;
  }
}

export async function deleteBudgetTemplate(id: string): Promise<StoreResult<true>> {
  try {
    await prisma.budgetTemplate.delete({ where: { id } });
    return ok(true);
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Template "${id}" not found.`);
    throw err;
  }
}
