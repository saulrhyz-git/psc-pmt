/**
 * lib/template-types.ts
 * -----------------------------------------------------------------------------
 * TypeScript schema for reusable templates, created from the Settings &
 * Templates tab. Currently only Budget templates exist — a saved set of
 * phase/category/amount line items that can be applied in one click to a
 * project's Budget tab (handy for repetitive project types, e.g. every
 * "Kitchen Remodel" starts from the same rough budget skeleton).
 *
 * Dependency-free (no fs/SDK imports), safe to import into Client Components.
 * Server-only persistence lives in lib/template-store.ts.
 *
 * Access note: like Project Management, template creation/editing is open to
 * every signed-in user for now (not admin-gated) — see lib/project-types.ts's
 * header comment for the same access-control decision applied here.
 * -----------------------------------------------------------------------------
 */

import type { BudgetCategory } from "./project-types";

export interface BudgetTemplateLineItem {
  phase: string;
  category: BudgetCategory;
  description?: string;
  budgeted: number;
}

export interface BudgetTemplate {
  id: string;
  name: string;
  description?: string;
  lineItems: BudgetTemplateLineItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateBudgetTemplateBody {
  name: string;
  description?: string;
  lineItems: BudgetTemplateLineItem[];
}

export type UpdateBudgetTemplateBody = Partial<CreateBudgetTemplateBody>;

export interface BudgetTemplatesListResponseBody {
  success: boolean;
  templates?: BudgetTemplate[];
  error?: string;
}

export interface BudgetTemplateResponseBody {
  success: boolean;
  template?: BudgetTemplate;
  error?: string;
}

/** POST body for applying a template's line items to a project's budget. */
export interface ApplyBudgetTemplateBody {
  templateId: string;
}
