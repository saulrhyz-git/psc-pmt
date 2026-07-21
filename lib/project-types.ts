/**
 * lib/project-types.ts
 * -----------------------------------------------------------------------------
 * TypeScript schema for Tool #2: Project Management. Deliberately
 * dependency-free (no `next/server`, no SDK imports, no `node:fs`) so it's
 * safe to import directly into Client Components — same rationale as
 * lib/vision-provider-metadata.ts and lib/estimate-utils.ts for Tool #1.
 *
 * Server-only persistence logic lives in lib/project-store.ts, which imports
 * these types but is never imported from a "use client" file.
 *
 * Access control note: per an explicit product decision, every enrolled user
 * (admin or student) can create/edit projects, tasks, budget, and resources
 * for now — this is a shared team tool, not a security boundary like AI
 * provider settings or user management. Role-based restrictions (e.g.
 * view-only for students) are a planned future enhancement, not built yet.
 * -----------------------------------------------------------------------------
 */

// -----------------------------------------------------------------------------
// Projects
// -----------------------------------------------------------------------------

export type ProjectStatus = "planning" | "active" | "on-hold" | "completed";

export interface Project {
  id: string;
  name: string;
  projectInCharge: string;
  clientName: string;
  dateStarted: string; // ISO date (yyyy-mm-dd)
  targetCompletionDate?: string; // ISO date
  address?: string;
  projectType?: string; // e.g. "Residential Remodel", "Commercial New Build"
  totalBudget: number;
  status: ProjectStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectBody {
  name: string;
  projectInCharge: string;
  clientName: string;
  dateStarted: string;
  targetCompletionDate?: string;
  address?: string;
  projectType?: string;
  totalBudget: number;
  status?: ProjectStatus;
  notes?: string;
}

export type UpdateProjectBody = Partial<CreateProjectBody>;

export interface ProjectsListResponseBody {
  success: boolean;
  projects?: Project[];
  error?: string;
}

export interface ProjectResponseBody {
  success: boolean;
  project?: Project;
  error?: string;
}

// -----------------------------------------------------------------------------
// Tasks
// -----------------------------------------------------------------------------

export type TaskStatus = "not-started" | "in-progress" | "blocked" | "completed";
export type TaskPriority = "low" | "medium" | "high";

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  phase: string; // e.g. "Foundation", "Framing", "Electrical" — also drives Gantt color-coding
  status: TaskStatus;
  progressPercent: number; // 0-100
  assignee?: string;
  priority: TaskPriority;
  startDate: string; // ISO date
  endDate: string; // ISO date
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskBody {
  title: string;
  description?: string;
  phase: string;
  status?: TaskStatus;
  progressPercent?: number;
  assignee?: string;
  priority?: TaskPriority;
  startDate: string;
  endDate: string;
}

export type UpdateTaskBody = Partial<CreateTaskBody>;

export interface TasksListResponseBody {
  success: boolean;
  tasks?: ProjectTask[];
  error?: string;
}

export interface TaskResponseBody {
  success: boolean;
  task?: ProjectTask;
  error?: string;
}

// -----------------------------------------------------------------------------
// Budget
// -----------------------------------------------------------------------------

export type BudgetCategory = "labor" | "materials" | "equipment" | "permits" | "subcontractor" | "contingency" | "other";

export interface BudgetLineItem {
  id: string;
  projectId: string;
  phase: string; // aligns with task phase names where possible
  category: BudgetCategory;
  description?: string;
  budgeted: number;
  spent: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBudgetLineItemBody {
  phase: string;
  category: BudgetCategory;
  description?: string;
  budgeted: number;
  spent?: number;
}

export type UpdateBudgetLineItemBody = Partial<CreateBudgetLineItemBody>;

export interface BudgetListResponseBody {
  success: boolean;
  lineItems?: BudgetLineItem[];
  error?: string;
}

export interface BudgetLineItemResponseBody {
  success: boolean;
  lineItem?: BudgetLineItem;
  error?: string;
}

// -----------------------------------------------------------------------------
// Resources — crew + equipment
// -----------------------------------------------------------------------------

export type CrewStatus = "active" | "on-leave" | "off-project";

export interface CrewMember {
  id: string;
  projectId: string;
  name: string;
  role: string; // e.g. "Foreman", "Electrician", "Carpenter"
  allocationPercent: number; // 0-100, share of their time on this project
  status: CrewStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCrewMemberBody {
  name: string;
  role: string;
  allocationPercent?: number;
  status?: CrewStatus;
  notes?: string;
}

export type UpdateCrewMemberBody = Partial<CreateCrewMemberBody>;

export type EquipmentStatus = "available" | "in-use" | "maintenance" | "reserved";

export interface Equipment {
  id: string;
  projectId: string;
  name: string;
  equipmentType: string; // e.g. "Excavator", "Crane", "Generator"
  status: EquipmentStatus;
  assignedTo?: string; // crew member name or task title
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEquipmentBody {
  name: string;
  equipmentType: string;
  status?: EquipmentStatus;
  assignedTo?: string;
  notes?: string;
}

export type UpdateEquipmentBody = Partial<CreateEquipmentBody>;

export interface CrewListResponseBody {
  success: boolean;
  crew?: CrewMember[];
  error?: string;
}

export interface CrewMemberResponseBody {
  success: boolean;
  member?: CrewMember;
  error?: string;
}

export interface EquipmentListResponseBody {
  success: boolean;
  equipment?: Equipment[];
  error?: string;
}

export interface EquipmentResponseBody {
  success: boolean;
  item?: Equipment;
  error?: string;
}

// -----------------------------------------------------------------------------
// Aggregate bundle (used by the export route and by the dashboard KPI calc)
// -----------------------------------------------------------------------------

export interface ProjectBundle {
  project: Project;
  tasks: ProjectTask[];
  budgetLineItems: BudgetLineItem[];
  crew: CrewMember[];
  equipment: Equipment[];
}

export interface ProjectBundleResponseBody {
  success: boolean;
  bundle?: ProjectBundle;
  error?: string;
}

// -----------------------------------------------------------------------------
// Derived KPIs (computed client- or server-side from a ProjectBundle — pure
// math, no persistence)
// -----------------------------------------------------------------------------

export interface ProjectKpis {
  activeTaskCount: number;
  overallProgressPercent: number; // average of task progressPercent, 0-100
  totalBudgeted: number;
  totalSpent: number;
  budgetBurnPercent: number; // totalSpent / totalBudgeted * 100 (0 if no budget)
  crewCount: number;
}
