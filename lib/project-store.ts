/**
 * lib/project-store.ts
 * -----------------------------------------------------------------------------
 * Server-only persistence for Tool #2 (Project Management). Same pattern as
 * lib/auth.ts and lib/ai-settings.ts: a single local, gitignored JSON file at
 * the project root (`.projects-data.local.json`), read fresh and written back
 * on every mutation — no database, no caching/singletons, no new npm
 * dependency for storage itself (only `xlsx`/SheetJS is added, for the export
 * route, which is unrelated to persistence).
 *
 * This file uses `node:fs`/`node:crypto` and must never be imported into a
 * `"use client"` component. Import it only from Route Handlers
 * (app/api/projects/**) and other server-only modules.
 * -----------------------------------------------------------------------------
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  BudgetLineItem,
  CreateBudgetLineItemBody,
  CreateCrewMemberBody,
  CreateEquipmentBody,
  CreateProjectBody,
  CreateTaskBody,
  CrewMember,
  Equipment,
  Project,
  ProjectBundle,
  ProjectTask,
  UpdateBudgetLineItemBody,
  UpdateCrewMemberBody,
  UpdateEquipmentBody,
  UpdateProjectBody,
  UpdateTaskBody,
} from "./project-types";

const DATA_FILE = path.join(process.cwd(), ".projects-data.local.json");

interface Store {
  projects: Project[];
  tasks: ProjectTask[];
  budgetLineItems: BudgetLineItem[];
  crew: CrewMember[];
  equipment: Equipment[];
}

const EMPTY_STORE: Store = { projects: [], tasks: [], budgetLineItems: [], crew: [], equipment: [] };

function loadStore(): Store {
  if (!fs.existsSync(DATA_FILE)) return { ...EMPTY_STORE };
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      projects: parsed.projects ?? [],
      tasks: parsed.tasks ?? [],
      budgetLineItems: parsed.budgetLineItems ?? [],
      crew: parsed.crew ?? [],
      equipment: parsed.equipment ?? [],
    };
  } catch {
    // Corrupt file — don't crash the app; start fresh rather than locking
    // everyone out of the tool (mirrors lib/auth.ts's re-seed-on-corruption behavior).
    return { ...EMPTY_STORE };
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

// -----------------------------------------------------------------------------
// Projects
// -----------------------------------------------------------------------------

export function listProjects(): Project[] {
  return loadStore().projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getProject(id: string): Project | null {
  return loadStore().projects.find((p) => p.id === id) ?? null;
}

export function createProject(body: CreateProjectBody): StoreResult<Project> {
  if (!body.name?.trim()) return fail("Project name is required.");
  if (!body.projectInCharge?.trim()) return fail("Project in charge is required.");
  if (!body.clientName?.trim()) return fail("Client name is required.");
  if (!body.dateStarted) return fail("Date started is required.");
  if (typeof body.totalBudget !== "number" || body.totalBudget < 0) {
    return fail("Total budget must be a non-negative number.");
  }

  const now = new Date().toISOString();
  const project: Project = {
    id: randomUUID(),
    name: body.name.trim(),
    projectInCharge: body.projectInCharge.trim(),
    clientName: body.clientName.trim(),
    dateStarted: body.dateStarted,
    targetCompletionDate: body.targetCompletionDate,
    address: body.address?.trim() || undefined,
    projectType: body.projectType?.trim() || undefined,
    totalBudget: body.totalBudget,
    status: body.status ?? "planning",
    notes: body.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  const store = loadStore();
  store.projects.push(project);
  saveStore(store);
  return ok(project);
}

export function updateProject(id: string, body: UpdateProjectBody): StoreResult<Project> {
  const store = loadStore();
  const project = store.projects.find((p) => p.id === id);
  if (!project) return fail(`Project "${id}" not found.`);

  if (body.totalBudget !== undefined && (typeof body.totalBudget !== "number" || body.totalBudget < 0)) {
    return fail("Total budget must be a non-negative number.");
  }

  Object.assign(project, {
    ...(body.name !== undefined && { name: body.name.trim() }),
    ...(body.projectInCharge !== undefined && { projectInCharge: body.projectInCharge.trim() }),
    ...(body.clientName !== undefined && { clientName: body.clientName.trim() }),
    ...(body.dateStarted !== undefined && { dateStarted: body.dateStarted }),
    ...(body.targetCompletionDate !== undefined && { targetCompletionDate: body.targetCompletionDate }),
    ...(body.address !== undefined && { address: body.address.trim() || undefined }),
    ...(body.projectType !== undefined && { projectType: body.projectType.trim() || undefined }),
    ...(body.totalBudget !== undefined && { totalBudget: body.totalBudget }),
    ...(body.status !== undefined && { status: body.status }),
    ...(body.notes !== undefined && { notes: body.notes.trim() || undefined }),
    updatedAt: new Date().toISOString(),
  });

  saveStore(store);
  return ok(project);
}

export function deleteProject(id: string): StoreResult<true> {
  const store = loadStore();
  const before = store.projects.length;
  store.projects = store.projects.filter((p) => p.id !== id);
  if (store.projects.length === before) return fail(`Project "${id}" not found.`);

  // Cascade delete everything scoped to this project.
  store.tasks = store.tasks.filter((t) => t.projectId !== id);
  store.budgetLineItems = store.budgetLineItems.filter((b) => b.projectId !== id);
  store.crew = store.crew.filter((c) => c.projectId !== id);
  store.equipment = store.equipment.filter((e) => e.projectId !== id);

  saveStore(store);
  return ok(true);
}

export function getProjectBundle(id: string): ProjectBundle | null {
  const store = loadStore();
  const project = store.projects.find((p) => p.id === id);
  if (!project) return null;
  return {
    project,
    tasks: store.tasks.filter((t) => t.projectId === id),
    budgetLineItems: store.budgetLineItems.filter((b) => b.projectId === id),
    crew: store.crew.filter((c) => c.projectId === id),
    equipment: store.equipment.filter((e) => e.projectId === id),
  };
}

// -----------------------------------------------------------------------------
// Tasks
// -----------------------------------------------------------------------------

export function listTasks(projectId: string): ProjectTask[] {
  return loadStore()
    .tasks.filter((t) => t.projectId === projectId)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function createTask(projectId: string, body: CreateTaskBody): StoreResult<ProjectTask> {
  const store = loadStore();
  if (!store.projects.some((p) => p.id === projectId)) return fail(`Project "${projectId}" not found.`);
  if (!body.title?.trim()) return fail("Task title is required.");
  if (!body.phase?.trim()) return fail("Phase is required.");
  if (!body.startDate || !body.endDate) return fail("Start and end dates are required.");
  if (body.startDate > body.endDate) return fail("Start date must be on or before the end date.");

  const now = new Date().toISOString();
  const task: ProjectTask = {
    id: randomUUID(),
    projectId,
    title: body.title.trim(),
    description: body.description?.trim() || undefined,
    phase: body.phase.trim(),
    status: body.status ?? "not-started",
    progressPercent: clampPercent(body.progressPercent ?? 0),
    assignee: body.assignee?.trim() || undefined,
    priority: body.priority ?? "medium",
    startDate: body.startDate,
    endDate: body.endDate,
    createdAt: now,
    updatedAt: now,
  };

  store.tasks.push(task);
  saveStore(store);
  return ok(task);
}

export function updateTask(projectId: string, taskId: string, body: UpdateTaskBody): StoreResult<ProjectTask> {
  const store = loadStore();
  const task = store.tasks.find((t) => t.id === taskId && t.projectId === projectId);
  if (!task) return fail(`Task "${taskId}" not found.`);

  const nextStart = body.startDate ?? task.startDate;
  const nextEnd = body.endDate ?? task.endDate;
  if (nextStart > nextEnd) return fail("Start date must be on or before the end date.");

  Object.assign(task, {
    ...(body.title !== undefined && { title: body.title.trim() }),
    ...(body.description !== undefined && { description: body.description.trim() || undefined }),
    ...(body.phase !== undefined && { phase: body.phase.trim() }),
    ...(body.status !== undefined && { status: body.status }),
    ...(body.progressPercent !== undefined && { progressPercent: clampPercent(body.progressPercent) }),
    ...(body.assignee !== undefined && { assignee: body.assignee.trim() || undefined }),
    ...(body.priority !== undefined && { priority: body.priority }),
    ...(body.startDate !== undefined && { startDate: body.startDate }),
    ...(body.endDate !== undefined && { endDate: body.endDate }),
    updatedAt: new Date().toISOString(),
  });

  saveStore(store);
  return ok(task);
}

export function deleteTask(projectId: string, taskId: string): StoreResult<true> {
  const store = loadStore();
  const before = store.tasks.length;
  store.tasks = store.tasks.filter((t) => !(t.id === taskId && t.projectId === projectId));
  if (store.tasks.length === before) return fail(`Task "${taskId}" not found.`);
  saveStore(store);
  return ok(true);
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// -----------------------------------------------------------------------------
// Budget
// -----------------------------------------------------------------------------

export function listBudgetLineItems(projectId: string): BudgetLineItem[] {
  return loadStore().budgetLineItems.filter((b) => b.projectId === projectId);
}

export function createBudgetLineItem(projectId: string, body: CreateBudgetLineItemBody): StoreResult<BudgetLineItem> {
  const store = loadStore();
  if (!store.projects.some((p) => p.id === projectId)) return fail(`Project "${projectId}" not found.`);
  if (!body.phase?.trim()) return fail("Phase is required.");
  if (!body.category) return fail("Category is required.");
  if (typeof body.budgeted !== "number" || body.budgeted < 0) return fail("Budgeted amount must be a non-negative number.");

  const now = new Date().toISOString();
  const lineItem: BudgetLineItem = {
    id: randomUUID(),
    projectId,
    phase: body.phase.trim(),
    category: body.category,
    description: body.description?.trim() || undefined,
    budgeted: body.budgeted,
    spent: body.spent ?? 0,
    createdAt: now,
    updatedAt: now,
  };

  store.budgetLineItems.push(lineItem);
  saveStore(store);
  return ok(lineItem);
}

export function updateBudgetLineItem(
  projectId: string,
  lineItemId: string,
  body: UpdateBudgetLineItemBody
): StoreResult<BudgetLineItem> {
  const store = loadStore();
  const lineItem = store.budgetLineItems.find((b) => b.id === lineItemId && b.projectId === projectId);
  if (!lineItem) return fail(`Budget line item "${lineItemId}" not found.`);

  if (body.budgeted !== undefined && (typeof body.budgeted !== "number" || body.budgeted < 0)) {
    return fail("Budgeted amount must be a non-negative number.");
  }
  if (body.spent !== undefined && (typeof body.spent !== "number" || body.spent < 0)) {
    return fail("Spent amount must be a non-negative number.");
  }

  Object.assign(lineItem, {
    ...(body.phase !== undefined && { phase: body.phase.trim() }),
    ...(body.category !== undefined && { category: body.category }),
    ...(body.description !== undefined && { description: body.description.trim() || undefined }),
    ...(body.budgeted !== undefined && { budgeted: body.budgeted }),
    ...(body.spent !== undefined && { spent: body.spent }),
    updatedAt: new Date().toISOString(),
  });

  saveStore(store);
  return ok(lineItem);
}

export function deleteBudgetLineItem(projectId: string, lineItemId: string): StoreResult<true> {
  const store = loadStore();
  const before = store.budgetLineItems.length;
  store.budgetLineItems = store.budgetLineItems.filter((b) => !(b.id === lineItemId && b.projectId === projectId));
  if (store.budgetLineItems.length === before) return fail(`Budget line item "${lineItemId}" not found.`);
  saveStore(store);
  return ok(true);
}

// -----------------------------------------------------------------------------
// Crew
// -----------------------------------------------------------------------------

export function listCrew(projectId: string): CrewMember[] {
  return loadStore().crew.filter((c) => c.projectId === projectId);
}

export function createCrewMember(projectId: string, body: CreateCrewMemberBody): StoreResult<CrewMember> {
  const store = loadStore();
  if (!store.projects.some((p) => p.id === projectId)) return fail(`Project "${projectId}" not found.`);
  if (!body.name?.trim()) return fail("Crew member name is required.");
  if (!body.role?.trim()) return fail("Role is required.");

  const now = new Date().toISOString();
  const member: CrewMember = {
    id: randomUUID(),
    projectId,
    name: body.name.trim(),
    role: body.role.trim(),
    allocationPercent: clampPercent(body.allocationPercent ?? 100),
    status: body.status ?? "active",
    notes: body.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  store.crew.push(member);
  saveStore(store);
  return ok(member);
}

export function updateCrewMember(projectId: string, memberId: string, body: UpdateCrewMemberBody): StoreResult<CrewMember> {
  const store = loadStore();
  const member = store.crew.find((c) => c.id === memberId && c.projectId === projectId);
  if (!member) return fail(`Crew member "${memberId}" not found.`);

  Object.assign(member, {
    ...(body.name !== undefined && { name: body.name.trim() }),
    ...(body.role !== undefined && { role: body.role.trim() }),
    ...(body.allocationPercent !== undefined && { allocationPercent: clampPercent(body.allocationPercent) }),
    ...(body.status !== undefined && { status: body.status }),
    ...(body.notes !== undefined && { notes: body.notes.trim() || undefined }),
    updatedAt: new Date().toISOString(),
  });

  saveStore(store);
  return ok(member);
}

export function deleteCrewMember(projectId: string, memberId: string): StoreResult<true> {
  const store = loadStore();
  const before = store.crew.length;
  store.crew = store.crew.filter((c) => !(c.id === memberId && c.projectId === projectId));
  if (store.crew.length === before) return fail(`Crew member "${memberId}" not found.`);
  saveStore(store);
  return ok(true);
}

// -----------------------------------------------------------------------------
// Equipment
// -----------------------------------------------------------------------------

export function listEquipment(projectId: string): Equipment[] {
  return loadStore().equipment.filter((e) => e.projectId === projectId);
}

export function createEquipment(projectId: string, body: CreateEquipmentBody): StoreResult<Equipment> {
  const store = loadStore();
  if (!store.projects.some((p) => p.id === projectId)) return fail(`Project "${projectId}" not found.`);
  if (!body.name?.trim()) return fail("Equipment name is required.");
  if (!body.equipmentType?.trim()) return fail("Equipment type is required.");

  const now = new Date().toISOString();
  const item: Equipment = {
    id: randomUUID(),
    projectId,
    name: body.name.trim(),
    equipmentType: body.equipmentType.trim(),
    status: body.status ?? "available",
    assignedTo: body.assignedTo?.trim() || undefined,
    notes: body.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  store.equipment.push(item);
  saveStore(store);
  return ok(item);
}

export function updateEquipment(projectId: string, itemId: string, body: UpdateEquipmentBody): StoreResult<Equipment> {
  const store = loadStore();
  const item = store.equipment.find((e) => e.id === itemId && e.projectId === projectId);
  if (!item) return fail(`Equipment "${itemId}" not found.`);

  Object.assign(item, {
    ...(body.name !== undefined && { name: body.name.trim() }),
    ...(body.equipmentType !== undefined && { equipmentType: body.equipmentType.trim() }),
    ...(body.status !== undefined && { status: body.status }),
    ...(body.assignedTo !== undefined && { assignedTo: body.assignedTo.trim() || undefined }),
    ...(body.notes !== undefined && { notes: body.notes.trim() || undefined }),
    updatedAt: new Date().toISOString(),
  });

  saveStore(store);
  return ok(item);
}

export function deleteEquipment(projectId: string, itemId: string): StoreResult<true> {
  const store = loadStore();
  const before = store.equipment.length;
  store.equipment = store.equipment.filter((e) => !(e.id === itemId && e.projectId === projectId));
  if (store.equipment.length === before) return fail(`Equipment "${itemId}" not found.`);
  saveStore(store);
  return ok(true);
}
