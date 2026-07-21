/**
 * lib/auth.ts
 * -----------------------------------------------------------------------------
 * Server-only authentication store. Gates the app so only enrolled users can
 * use it. Password hashing/session signing is still hand-rolled on Node's
 * built-in `crypto` module (scrypt + HMAC-SHA256) — that choice predates and
 * is independent of the storage backend below.
 *
 * Storage: Postgres via Prisma (see prisma/schema.prisma's `User` and
 * `AppSecret` models). This used to be a single gitignored JSON file
 * (`.auth-users.local.json`); the User table replaces the user list, and the
 * singleton `AppSecret` row (id = 1) replaces the JSON file's random
 * session-signing secret.
 *
 * Both are created lazily on first access, matching the old JSON file's
 * "create on first use" behavior:
 *   - `ensureMasterAdminSeeded()` inserts the seed master admin the first
 *     time the User table is empty:
 *       username: saulrhyz
 *       password: 081183
 *     (hashed via scrypt before storage — the plaintext password above is
 *     never persisted).
 *   - `getOrCreateSessionSecret()` upserts a random 32-byte secret into
 *     `AppSecret` the first time it's needed.
 *
 * This file must never be imported into a `"use client"` component — it uses
 * `node:crypto` and the Prisma client (which opens real TCP connections to
 * Postgres), both server-only. Import it only from Route Handlers
 * (app/api/**) and other server-only modules.
 * -----------------------------------------------------------------------------
 */

import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import type { EnrolledUser, SessionUser, UserRole } from "./types";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./auth-constants";

const SEED_ADMIN_USERNAME = "saulrhyz";
const SEED_ADMIN_PASSWORD = "081183";

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS };

// -----------------------------------------------------------------------------
// Password hashing
// -----------------------------------------------------------------------------

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPasswordHash(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hashHex, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

// -----------------------------------------------------------------------------
// Lazy bootstrap (replaces the old JSON file's "create on first load")
// -----------------------------------------------------------------------------

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

function isNotFoundError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2025";
}

async function getOrCreateSessionSecret(): Promise<string> {
  const freshlyGenerated = randomBytes(32).toString("hex");
  const row = await prisma.appSecret.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, sessionSecret: freshlyGenerated },
  });
  return row.sessionSecret;
}

async function ensureMasterAdminSeeded(): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) return;
  try {
    await prisma.user.create({
      data: {
        username: SEED_ADMIN_USERNAME,
        passwordHash: hashPassword(SEED_ADMIN_PASSWORD),
        role: "admin",
      },
    });
  } catch (err) {
    // Race: a concurrent request already seeded it between our count() and create(). Fine.
    if (!isUniqueConstraintError(err)) throw err;
  }
}

// -----------------------------------------------------------------------------
// Session tokens (hand-rolled HMAC-signed payload, not a JWT library)
// -----------------------------------------------------------------------------

interface SessionPayload {
  username: string;
  role: UserRole;
  iat: number;
}

function signSession(payload: SessionPayload, secret: string): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

function verifySessionTokenInternal(token: string, secret: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expectedSig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8")) as SessionPayload;
    if (!payload.username || !payload.role || typeof payload.iat !== "number") return null;
    const ageSeconds = Date.now() / 1000 - payload.iat;
    if (ageSeconds > SESSION_MAX_AGE_SECONDS) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Create a signed session token for a successfully authenticated user. */
export async function createSessionToken(username: string, role: UserRole): Promise<string> {
  const secret = await getOrCreateSessionSecret();
  return signSession({ username, role, iat: Math.floor(Date.now() / 1000) }, secret);
}

/** Verify a session token (read from the session cookie). Returns null if invalid/expired. */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const secret = await getOrCreateSessionSecret();
  const payload = verifySessionTokenInternal(token, secret);
  if (!payload) return null;
  // Re-check the user still exists (e.g. wasn't removed by an admin after login).
  const user = await prisma.user.findUnique({ where: { username: payload.username } });
  if (!user) return null;
  return { username: user.username, role: user.role };
}

// -----------------------------------------------------------------------------
// Route Handler helpers — the real authorization boundary (see middleware.ts's
// header comment: middleware only checks cookie *presence*; every API route
// that touches real data must independently verify the session here).
// -----------------------------------------------------------------------------

/** Read + verify the session cookie on an incoming Route Handler request. */
export async function getSessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

/** Require any authenticated user (admin or student). Returns null if unauthenticated. */
export async function requireSession(req: NextRequest): Promise<SessionUser | null> {
  return getSessionFromRequest(req);
}

/** Require an admin. Returns null if unauthenticated OR authenticated as a non-admin. */
export async function requireAdmin(req: NextRequest): Promise<SessionUser | null> {
  const user = await getSessionFromRequest(req);
  if (!user || user.role !== "admin") return null;
  return user;
}

// -----------------------------------------------------------------------------
// User management
// -----------------------------------------------------------------------------

/** Verify credentials. Returns the SessionUser on success, or null on failure. */
export async function login(username: string, password: string): Promise<SessionUser | null> {
  await ensureMasterAdminSeeded();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return null;
  if (!verifyPasswordHash(password, user.passwordHash)) return null;
  return { username: user.username, role: user.role };
}

export async function listUsers(): Promise<EnrolledUser[]> {
  await ensureMasterAdminSeeded();
  const users = await prisma.user.findMany({ orderBy: { username: "asc" } });
  return users.map((u) => ({ username: u.username, role: u.role, createdAt: u.createdAt.toISOString() }));
}

export async function getUser(username: string): Promise<EnrolledUser | null> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return null;
  return { username: user.username, role: user.role, createdAt: user.createdAt.toISOString() };
}

export interface AddUserResult {
  success: boolean;
  error?: string;
  user?: EnrolledUser;
}

/** Admin-only: enroll a new user. Usernames are unique, case-sensitive. */
export async function addUser(username: string, password: string, role: UserRole = "student"): Promise<AddUserResult> {
  const trimmed = username.trim();
  if (trimmed.length < 3) {
    return { success: false, error: "Username must be at least 3 characters." };
  }
  if (password.length < 4) {
    return { success: false, error: "Password must be at least 4 characters." };
  }

  try {
    const user = await prisma.user.create({
      data: { username: trimmed, passwordHash: hashPassword(password), role },
    });
    return {
      success: true,
      user: { username: user.username, role: user.role, createdAt: user.createdAt.toISOString() },
    };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { success: false, error: `User "${trimmed}" already exists.` };
    }
    throw err;
  }
}

export interface RemoveUserResult {
  success: boolean;
  error?: string;
}

/** Admin-only: remove an enrolled user. The seed master admin cannot be removed. */
export async function removeUser(username: string): Promise<RemoveUserResult> {
  if (username === SEED_ADMIN_USERNAME) {
    return { success: false, error: `"${SEED_ADMIN_USERNAME}" is the master admin account and cannot be removed.` };
  }
  try {
    await prisma.user.delete({ where: { username } });
    return { success: true };
  } catch (err) {
    if (isNotFoundError(err)) {
      return { success: false, error: `User "${username}" not found.` };
    }
    throw err;
  }
}

export interface ChangePasswordResult {
  success: boolean;
  error?: string;
}

/** Change a user's password (self-service or admin-driven). */
export async function changePassword(username: string, newPassword: string): Promise<ChangePasswordResult> {
  if (newPassword.length < 4) {
    return { success: false, error: "Password must be at least 4 characters." };
  }
  try {
    await prisma.user.update({ where: { username }, data: { passwordHash: hashPassword(newPassword) } });
    return { success: true };
  } catch (err) {
    if (isNotFoundError(err)) {
      return { success: false, error: `User "${username}" not found.` };
    }
    throw err;
  }
}
