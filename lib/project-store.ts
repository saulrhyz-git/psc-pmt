/**
 * lib/project-store.ts
 * -----------------------------------------------------------------------------
 * Server-only persistence for Tool #2 (Project Management).
 *
 * Storage: Postgres via Prisma (see prisma/schema.prisma's `Project`, `Task`,
 * `BudgetLineItem`, `CrewMember`, `Equipment` models). This used to be a
 * single gitignored JSON file (`.projects-data.local.json`) with manual
 * cascade-delete filtering; cascade deletes are now enforced by the database
 * itself (`onDelete: Cascade` on every child model's `projectId` foreign
 * key), so deleting a project is a single `prisma.project.delete()` call.
 *
 * Enum note: several app-facing string unions use hyphens (e.g. "on-hold",
 * "not-started", "in-use") but Prisma enum identifiers can't contain
 * hyphens, so the schema maps underscored identifiers to hyphenated DB
 * values (`on_hold @map("on-hold")`) and the *generated TypeScript enum
 * type* uses the underscored identifier. The TO_DB/FROM_DB lookup tables
 * below translate between the two at the store boundary so every other
 * layer of the app (types, routes, UI) is untouched.
 *
 * This file uses the Prisma client (real TCP connections to Postgres) and
 * must never be imported into a `"use client"` component. Import it only
 * from Route Handlers (app/api/projects/**) and other server-only modules.
 * -----------------------------------------------------------------------------
 */

import { randomUUID } from "node:crypto";
import type {
  BudgetCategory as DbBudgetCategory,
  CrewStatus as DbCrewStatus,
  EquipmentStatus as DbEquipmentStatus,
  Prisma,
  ProjectStatus as DbProjectStatus,
  TaskPriority as DbTaskPriority,
  TaskStatus as DbTaskStatus,
} from "@prisma/client";
import { prisma } from "./prisma";
import type {
  BudgetLineItem,
  CreateBudgetLineItemBody,
  CreateCrewMemberBody,
  CreateEquipmentBody,
  CreateProjectBody,
  CreateTaskBody,
  CrewMember,
  CrewStatus,
  Equipment,
  EquipmentStatus,
  Project,
  ProjectBundle,
  ProjectStatus,
  ProjectTask,
  TaskStatus,
  UpdateBudgetLineItemBody,
  UpdateCrewMemberBody,
  UpdateEquipmentBody,
  UpdateProjectBody,
  UpdateTaskBody,
} from "./project-types";

// -----------------------------------------------------------------------------
// Enum translation (app hyphenated <-> Prisma underscored identifiers)
// -----------------------------------------------------------------------------

const PROJECT_STATUS_TO_DB: Record<ProjectStatus, DbProjectStatus> = {
  planning: "planning",
  active: "active",
  "on-hold": "on_hold",
  completed: "completed",
};
const PROJECT_STATUS_FROM_DB: Record<DbProjectStatus, ProjectStatus> = {
  planning: "planning",
  active: "active",
  on_hold: "on-hold",
  completed: "completed",
};

const TASK_STATUS_TO_DB: Record<TaskStatus, DbTaskStatus> = {
  "not-started": "not_started",
  "in-progress": "in_progress",
  blocked: "blocked",
  completed: "completed",
};
const TASK_STATUS_FROM_DB: Record<DbTaskStatus, TaskStatus> = {
  not_started: "not-started",
  in_progress: "in-progress",
  blocked: "blocked",
  completed: "completed",
};

const CREW_STATUS_TO_DB: Record<CrewStatus, DbCrewStatus> = {
  active: "active",
  "on-leave": "on_leave",
  "off-project": "off_project",
};
const CREW_STATUS_FROM_DB: Record<DbCrewStatus, CrewStatus> = {
  active: "active",
  on_leave: "on-leave",
  off_project: "off-project",
  // "inactive" exists in the DB enum (added upstream, not exposed as an app-level
  // status) — treat it as the closest equivalent so a row using it still renders.
  inactive: "off-project",
};

const EQUIPMENT_STATUS_TO_DB: Record<EquipmentStatus, DbEquipmentStatus> = {
  available: "available",
  "in-use": "in_use",
  maintenance: "maintenance",
  reserved: "reserved",
};
const EQUIPMENT_STATUS_FROM_DB: Record<DbEquipmentStatus, EquipmentStatus> = {
  available: "available",
  in_use: "in-use",
  maintenance: "maintenance",
  reserved: "reserved",
};

// TaskPriority and BudgetCategory have no hyphens, so the app union and the
// Prisma-generated union share identical literal values — no translation
// needed, they're structurally the same type.

// -----------------------------------------------------------------------------
// Row -> app-type mappers
// -----------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/ban-types -- `{}` is Prisma's documented idiom for "the plain model payload, no include/select"
type ProjectRow = Prisma.ProjectGetPayload<{}>;
// eslint-disable-next-line @typescript-eslint/ban-types
type TaskRow = Prisma.TaskGetPayload<{}>;
// eslint-disable-next-line @typescript-eslint/ban-types
type BudgetLineItemRow = Prisma.BudgetLineItemGetPayload<{}>;
// eslint-disable-next-line @typescript-eslint/ban-types
type CrewMemberRow = Prisma.CrewMemberGetPayload<{}>;
// eslint-disable-next-line @typescript-eslint/ban-types
type EquipmentRow = Prisma.EquipmentGetPayload<{}>;

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    projectInCharge: row.projectInCharge,
    clientName: row.clientName,
    dateStarted: row.dateStarted,
    targetCompletionDate: row.targetCompletionDate ?? undefined,
    address: row.address ?? undefined,
    projectType: row.projectType ?? undefined,
    totalBudget: row.totalBudget.toNumber(),
    status: PROJECT_STATUS_FROM_DB[row.status],
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toTask(row: TaskRow): ProjectTask {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description ?? undefined,
    phase: row.phase,
    status: TASK_STATUS_FROM_DB[row.status],
    progressPercent: row.progressPercent,
    assignee: row.assignee ?? undefined,
    priority: row.priority,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toBudgetLineItem(row: BudgetLineItemRow): BudgetLineItem {
  return {
    id: row.id,
    projectId: row.projectId,
    phase: row.phase,
    category: row.category,
    description: row.description ?? undefined,
    budgeted: row.budgeted.toNumber(),
    spent: row.spent.toNumber(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toCrewMember(row: CrewMemberRow): CrewMember {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    role: row.role,
    allocationPercent: row.allocationPercent,
    status: CREW_STATUS_FROM_DB[row.status],
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toEquipment(row: EquipmentRow): Equipment {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    equipmentType: row.equipmentType,
    status: EQUIPMENT_STATUS_FROM_DB[row.status],
    assignedTo: row.assignedTo ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// -----------------------------------------------------------------------------
// Result envelope + error helpers
// -----------------------------------------------------------------------------

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

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// -----------------------------------------------------------------------------
// Projects
// -----------------------------------------------------------------------------

export async function listProjects(): Promise<Project[]> {
  const rows = await prisma.project.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toProject);
}

export async function getProject(id: string): Promise<Project | null> {
  const row = await prisma.project.findUnique({ where: { id } });
  return row ? toProject(row) : null;
}

export async function createProject(body: CreateProjectBody): Promise<StoreResult<Project>> {
  if (!body.name?.trim()) return fail("Project name is required.");
  if (!body.projectInCharge?.trim()) return fail("Project in charge is required.");
  if (!body.clientName?.trim()) return fail("Client name is required.");
  if (!body.dateStarted) return fail("Date started is required.");
  if (typeof body.totalBudget !== "number" || body.totalBudget < 0) {
    return fail("Total budget must be a non-negative number.");
  }

  const row = await prisma.project.create({
    data: {
      id: randomUUID(),
      name: body.name.trim(),
      projectInCharge: body.projectInCharge.trim(),
      clientName: body.clientName.trim(),
      dateStarted: body.dateStarted,
      targetCompletionDate: body.targetCompletionDate,
      address: body.address?.trim() || undefined,
      projectType: body.projectType?.trim() || undefined,
      totalBudget: body.totalBudget,
      status: PROJECT_STATUS_TO_DB[body.status ?? "planning"],
      notes: body.notes?.trim() || undefined,
    },
  });
  return ok(toProject(row));
}

export async function updateProject(id: string, body: UpdateProjectBody): Promise<StoreResult<Project>> {
  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) return fail(`Project "${id}" not found.`);

  if (body.totalBudget !== undefined && (typeof body.totalBudget !== "number" || body.totalBudget < 0)) {
    return fail("Total budget must be a non-negative number.");
  }

  try {
    const row = await prisma.project.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.projectInCharge !== undefined && { projectInCharge: body.projectInCharge.trim() }),
        ...(body.clientName !== undefined && { clientName: body.clientName.trim() }),
        ...(body.dateStarted !== undefined && { dateStarted: body.dateStarted }),
        ...(body.targetCompletionDate !== undefined && { targetCompletionDate: body.targetCompletionDate }),
        ...(body.address !== undefined && { address: body.address.trim() || null }),
        ...(body.projectType !== undefined && { projectType: body.projectType.trim() || null }),
        ...(body.totalBudget !== undefined && { totalBudget: body.totalBudget }),
        ...(body.status !== undefined && { status: PROJECT_STATUS_TO_DB[body.status] }),
        ...(body.notes !== undefined && { notes: body.notes.trim() || null }),
      },
    });
    return ok(toProject(row));
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Project "${id}" not found.`);
    throw err;
  }
}

export async function deleteProject(id: string): Promise<StoreResult<true>> {
  try {
    // Children (tasks, budget line items, crew, equipment) cascade-delete
    // automatically via each model's `onDelete: Cascade` foreign key.
    await prisma.project.delete({ where: { id } });
    return ok(true);
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Project "${id}" not found.`);
    throw err;
  }
}

export async function getProjectBundle(id: string): Promise<ProjectBundle | null> {
  const row = await prisma.project.findUnique({
    where: { id },
    include: {
      tasks: { orderBy: { startDate: "asc" } },
      budgetItems: { orderBy: { createdAt: "asc" } },
      crew: { orderBy: { createdAt: "asc" } },
      equipment: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) return null;
  return {
    project: toProject(row),
    tasks: row.tasks.map(toTask),
    budgetLineItems: row.budgetItems.map(toBudgetLineItem),
    crew: row.crew.map(toCrewMember),
    equipment: row.equipment.map(toEquipment),
  };
}

// -----------------------------------------------------------------------------
// Tasks
// -----------------------------------------------------------------------------

export async function listTasks(projectId: string): Promise<ProjectTask[]> {
  const rows = await prisma.task.findMany({ where: { projectId }, orderBy: { startDate: "asc" } });
  return rows.map(toTask);
}

export async function createTask(projectId: string, body: CreateTaskBody): Promise<StoreResult<ProjectTask>> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return fail(`Project "${projectId}" not found.`);
  if (!body.title?.trim()) return fail("Task title is required.");
  if (!body.phase?.trim()) return fail("Phase is required.");
  if (!body.startDate || !body.endDate) return fail("Start and end dates are required.");
  if (body.startDate > body.endDate) return fail("Start date must be on or before the end date.");

  const row = await prisma.task.create({
    data: {
      id: randomUUID(),
      projectId,
      title: body.title.trim(),
      description: body.description?.trim() || undefined,
      phase: body.phase.trim(),
      status: TASK_STATUS_TO_DB[body.status ?? "not-started"],
      progressPercent: clampPercent(body.progressPercent ?? 0),
      assignee: body.assignee?.trim() || undefined,
      priority: body.priority ?? "medium",
      startDate: body.startDate,
      endDate: body.endDate,
    },
  });
  return ok(toTask(row));
}

export async function updateTask(projectId: string, taskId: string, body: UpdateTaskBody): Promise<StoreResult<ProjectTask>> {
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing || existing.projectId !== projectId) return fail(`Task "${taskId}" not found.`);

  const nextStart = body.startDate ?? existing.startDate;
  const nextEnd = body.endDate ?? existing.endDate;
  if (nextStart > nextEnd) return fail("Start date must be on or before the end date.");

  try {
    const row = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(body.title !== undefined && { title: body.title.trim() }),
        ...(body.description !== undefined && { description: body.description.trim() || null }),
        ...(body.phase !== undefined && { phase: body.phase.trim() }),
        ...(body.status !== undefined && { status: TASK_STATUS_TO_DB[body.status] }),
        ...(body.progressPercent !== undefined && { progressPercent: clampPercent(body.progressPercent) }),
        ...(body.assignee !== undefined && { assignee: body.assignee.trim() || null }),
        ...(body.priority !== undefined && { priority: body.priority }),
        ...(body.startDate !== undefined && { startDate: body.startDate }),
        ...(body.endDate !== undefined && { endDate: body.endDate }),
      },
    });
    return ok(toTask(row));
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Task "${taskId}" not found.`);
    throw err;
  }
}

export async function deleteTask(projectId: string, taskId: string): Promise<StoreResult<true>> {
  const existing = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) return fail(`Task "${taskId}" not found.`);
  try {
    await prisma.task.delete({ where: { id: taskId } });
    return ok(true);
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Task "${taskId}" not found.`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Budget
// -----------------------------------------------------------------------------

export async function listBudgetLineItems(projectId: string): Promise<BudgetLineItem[]> {
  const rows = await prisma.budgetLineItem.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  return rows.map(toBudgetLineItem);
}

export async function createBudgetLineItem(
  projectId: string,
  body: CreateBudgetLineItemBody
): Promise<StoreResult<BudgetLineItem>> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return fail(`Project "${projectId}" not found.`);
  if (!body.phase?.trim()) return fail("Phase is required.");
  if (!body.category) return fail("Category is required.");
  if (typeof body.budgeted !== "number" || body.budgeted < 0) return fail("Budgeted amount must be a non-negative number.");

  const row = await prisma.budgetLineItem.create({
    data: {
      id: randomUUID(),
      projectId,
      phase: body.phase.trim(),
      category: body.category as DbBudgetCategory,
      description: body.description?.trim() || undefined,
      budgeted: body.budgeted,
      spent: body.spent ?? 0,
    },
  });
  return ok(toBudgetLineItem(row));
}

export async function updateBudgetLineItem(
  projectId: string,
  lineItemId: string,
  body: UpdateBudgetLineItemBody
): Promise<StoreResult<BudgetLineItem>> {
  const existing = await prisma.budgetLineItem.findUnique({ where: { id: lineItemId }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) return fail(`Budget line item "${lineItemId}" not found.`);

  if (body.budgeted !== undefined && (typeof body.budgeted !== "number" || body.budgeted < 0)) {
    return fail("Budgeted amount must be a non-negative number.");
  }
  if (body.spent !== undefined && (typeof body.spent !== "number" || body.spent < 0)) {
    return fail("Spent amount must be a non-negative number.");
  }

  try {
    const row = await prisma.budgetLineItem.update({
      where: { id: lineItemId },
      data: {
        ...(body.phase !== undefined && { phase: body.phase.trim() }),
        ...(body.category !== undefined && { category: body.category as DbBudgetCategory }),
        ...(body.description !== undefined && { description: body.description.trim() || null }),
        ...(body.budgeted !== undefined && { budgeted: body.budgeted }),
        ...(body.spent !== undefined && { spent: body.spent }),
      },
    });
    return ok(toBudgetLineItem(row));
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Budget line item "${lineItemId}" not found.`);
    throw err;
  }
}

export async function deleteBudgetLineItem(projectId: string, lineItemId: string): Promise<StoreResult<true>> {
  const existing = await prisma.budgetLineItem.findUnique({ where: { id: lineItemId }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) return fail(`Budget line item "${lineItemId}" not found.`);
  try {
    await prisma.budgetLineItem.delete({ where: { id: lineItemId } });
    return ok(true);
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Budget line item "${lineItemId}" not found.`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Crew
// -----------------------------------------------------------------------------

export async function listCrew(projectId: string): Promise<CrewMember[]> {
  const rows = await prisma.crewMember.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  return rows.map(toCrewMember);
}

export async function createCrewMember(projectId: string, body: CreateCrewMemberBody): Promise<StoreResult<CrewMember>> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return fail(`Project "${projectId}" not found.`);
  if (!body.name?.trim()) return fail("Crew member name is required.");
  if (!body.role?.trim()) return fail("Role is required.");

  const row = await prisma.crewMember.create({
    data: {
      id: randomUUID(),
      projectId,
      name: body.name.trim(),
      role: body.role.trim(),
      allocationPercent: clampPercent(body.allocationPercent ?? 100),
      status: CREW_STATUS_TO_DB[body.status ?? "active"],
      notes: body.notes?.trim() || undefined,
    },
  });
  return ok(toCrewMember(row));
}

export async function updateCrewMember(
  projectId: string,
  memberId: string,
  body: UpdateCrewMemberBody
): Promise<StoreResult<CrewMember>> {
  const existing = await prisma.crewMember.findUnique({ where: { id: memberId }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) return fail(`Crew member "${memberId}" not found.`);

  try {
    const row = await prisma.crewMember.update({
      where: { id: memberId },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.role !== undefined && { role: body.role.trim() }),
        ...(body.allocationPercent !== undefined && { allocationPercent: clampPercent(body.allocationPercent) }),
        ...(body.status !== undefined && { status: CREW_STATUS_TO_DB[body.status] }),
        ...(body.notes !== undefined && { notes: body.notes.trim() || null }),
      },
    });
    return ok(toCrewMember(row));
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Crew member "${memberId}" not found.`);
    throw err;
  }
}

export async function deleteCrewMember(projectId: string, memberId: string): Promise<StoreResult<true>> {
  const existing = await prisma.crewMember.findUnique({ where: { id: memberId }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) return fail(`Crew member "${memberId}" not found.`);
  try {
    await prisma.crewMember.delete({ where: { id: memberId } });
    return ok(true);
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Crew member "${memberId}" not found.`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Equipment
// -----------------------------------------------------------------------------

export async function listEquipment(projectId: string): Promise<Equipment[]> {
  const rows = await prisma.equipment.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  return rows.map(toEquipment);
}

export async function createEquipment(projectId: string, body: CreateEquipmentBody): Promise<StoreResult<Equipment>> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return fail(`Project "${projectId}" not found.`);
  if (!body.name?.trim()) return fail("Equipment name is required.");
  if (!body.equipmentType?.trim()) return fail("Equipment type is required.");

  const row = await prisma.equipment.create({
    data: {
      id: randomUUID(),
      projectId,
      name: body.name.trim(),
      equipmentType: body.equipmentType.trim(),
      status: EQUIPMENT_STATUS_TO_DB[body.status ?? "available"],
      assignedTo: body.assignedTo?.trim() || undefined,
      notes: body.notes?.trim() || undefined,
    },
  });
  return ok(toEquipment(row));
}

export async function updateEquipment(
  projectId: string,
  itemId: string,
  body: UpdateEquipmentBody
): Promise<StoreResult<Equipment>> {
  const existing = await prisma.equipment.findUnique({ where: { id: itemId }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) return fail(`Equipment "${itemId}" not found.`);

  try {
    const row = await prisma.equipment.update({
      where: { id: itemId },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.equipmentType !== undefined && { equipmentType: body.equipmentType.trim() }),
        ...(body.status !== undefined && { status: EQUIPMENT_STATUS_TO_DB[body.status] }),
        ...(body.assignedTo !== undefined && { assignedTo: body.assignedTo.trim() || null }),
        ...(body.notes !== undefined && { notes: body.notes.trim() || null }),
      },
    });
    return ok(toEquipment(row));
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Equipment "${itemId}" not found.`);
    throw err;
  }
}

export async function deleteEquipment(projectId: string, itemId: string): Promise<StoreResult<true>> {
  const existing = await prisma.equipment.findUnique({ where: { id: itemId }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) return fail(`Equipment "${itemId}" not found.`);
  try {
    await prisma.equipment.delete({ where: { id: itemId } });
    return ok(true);
  } catch (err) {
    if (isNotFoundError(err)) return fail(`Equipment "${itemId}" not found.`);
    throw err;
  }
}
