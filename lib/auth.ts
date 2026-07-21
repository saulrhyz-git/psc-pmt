/**
 * lib/auth.ts
 * -----------------------------------------------------------------------------
 * Server-only authentication store. Gates the app so only enrolled users can
 * use it. Deliberately built on Node's built-in `crypto` module (no new npm
 * dependency) after this project already learned the pain of native-build
 * dependencies (see app/api/analyze/route.ts's PDF-rasterization history).
 *
 * Storage: a single local, gitignored JSON file at the project root,
 * `.auth-users.local.json` (see .gitignore). It holds:
 *   - a randomly generated session-signing secret (created once, on first run)
 *   - the list of enrolled users, with scrypt password hashes (never plaintext)
 *
 * On first run this file does not exist, so `loadStore()` creates it and
 * seeds a single master admin account:
 *   username: saulrhyz
 *   password: 081183
 * (hashed before storage — the plaintext password above is never persisted).
 *
 * This file must never be imported into a `"use client"` component — it uses
 * `node:fs` and `node:crypto`, both server-only. Import it only from Route
 * Handlers (app/api/**) and other server-only modules.
 * -----------------------------------------------------------------------------
 */

import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import type { EnrolledUser, SessionUser, UserRole } from "./types";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./auth-constants";

const AUTH_FILE = path.join(process.cwd(), ".auth-users.local.json");

const SEED_ADMIN_USERNAME = "saulrhyz";
const SEED_ADMIN_PASSWORD = "081183";

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS };

interface StoredUser {
  username: string;
  passwordHash: string; // "<saltHex>:<hashHex>" (scrypt)
  role: UserRole;
  createdAt: string;
}

interface AuthStore {
  sessionSecret: string;
  users: StoredUser[];
}

// -----------------------------------------------------------------------------
// Store persistence
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

function seedStore(): AuthStore {
  const now = new Date().toISOString();
  return {
    sessionSecret: randomBytes(32).toString("hex"),
    users: [
      {
        username: SEED_ADMIN_USERNAME,
        passwordHash: hashPassword(SEED_ADMIN_PASSWORD),
        role: "admin",
        createdAt: now,
      },
    ],
  };
}

function loadStore(): AuthStore {
  if (!fs.existsSync(AUTH_FILE)) {
    const fresh = seedStore();
    saveStore(fresh);
    return fresh;
  }
  try {
    const raw = fs.readFileSync(AUTH_FILE, "utf-8");
    const parsed = JSON.parse(raw) as AuthStore;
    if (!parsed.sessionSecret || !Array.isArray(parsed.users)) {
      throw new Error("malformed auth store");
    }
    return parsed;
  } catch {
    // Corrupt file — re-seed rather than locking everyone out permanently.
    const fresh = seedStore();
    saveStore(fresh);
    return fresh;
  }
}

function saveStore(store: AuthStore): void {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(store, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
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
export function createSessionToken(username: string, role: UserRole): string {
  const store = loadStore();
  return signSession({ username, role, iat: Math.floor(Date.now() / 1000) }, store.sessionSecret);
}

/** Verify a session token (read from the session cookie). Returns null if invalid/expired. */
export function verifySessionToken(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const store = loadStore();
  const payload = verifySessionTokenInternal(token, store.sessionSecret);
  if (!payload) return null;
  // Re-check the user still exists (e.g. wasn't removed by an admin after login).
  const user = store.users.find((u) => u.username === payload.username);
  if (!user) return null;
  return { username: user.username, role: user.role };
}

// -----------------------------------------------------------------------------
// Route Handler helpers — the real authorization boundary (see middleware.ts's
// header comment: middleware only checks cookie *presence*; every API route
// that touches real data must independently verify the session here).
// -----------------------------------------------------------------------------

/** Read + verify the session cookie on an incoming Route Handler request. */
export function getSessionFromRequest(req: NextRequest): SessionUser | null {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

/** Require any authenticated user (admin or student). Returns null if unauthenticated. */
export function requireSession(req: NextRequest): SessionUser | null {
  return getSessionFromRequest(req);
}

/** Require an admin. Returns null if unauthenticated OR authenticated as a non-admin. */
export function requireAdmin(req: NextRequest): SessionUser | null {
  const user = getSessionFromRequest(req);
  if (!user || user.role !== "admin") return null;
  return user;
}

// -----------------------------------------------------------------------------
// User management
// -----------------------------------------------------------------------------

/** Verify credentials. Returns the SessionUser on success, or null on failure. */
export function login(username: string, password: string): SessionUser | null {
  const store = loadStore();
  const user = store.users.find((u) => u.username === username);
  if (!user) return null;
  if (!verifyPasswordHash(password, user.passwordHash)) return null;
  return { username: user.username, role: user.role };
}

export function listUsers(): EnrolledUser[] {
  const store = loadStore();
  return store.users.map((u) => ({ username: u.username, role: u.role, createdAt: u.createdAt }));
}

export function getUser(username: string): EnrolledUser | null {
  const store = loadStore();
  const user = store.users.find((u) => u.username === username);
  if (!user) return null;
  return { username: user.username, role: user.role, createdAt: user.createdAt };
}

export interface AddUserResult {
  success: boolean;
  error?: string;
  user?: EnrolledUser;
}

/** Admin-only: enroll a new user. Usernames are unique, case-sensitive. */
export function addUser(username: string, password: string, role: UserRole = "student"): AddUserResult {
  const trimmed = username.trim();
  if (trimmed.length < 3) {
    return { success: false, error: "Username must be at least 3 characters." };
  }
  if (password.length < 4) {
    return { success: false, error: "Password must be at least 4 characters." };
  }
  const store = loadStore();
  if (store.users.some((u) => u.username === trimmed)) {
    return { success: false, error: `User "${trimmed}" already exists.` };
  }
  const createdAt = new Date().toISOString();
  store.users.push({ username: trimmed, passwordHash: hashPassword(password), role, createdAt });
  saveStore(store);
  return { success: true, user: { username: trimmed, role, createdAt } };
}

export interface RemoveUserResult {
  success: boolean;
  error?: string;
}

/** Admin-only: remove an enrolled user. The seed master admin cannot be removed. */
export function removeUser(username: string): RemoveUserResult {
  if (username === SEED_ADMIN_USERNAME) {
    return { success: false, error: `"${SEED_ADMIN_USERNAME}" is the master admin account and cannot be removed.` };
  }
  const store = loadStore();
  const before = store.users.length;
  store.users = store.users.filter((u) => u.username !== username);
  if (store.users.length === before) {
    return { success: false, error: `User "${username}" not found.` };
  }
  saveStore(store);
  return { success: true };
}

export interface ChangePasswordResult {
  success: boolean;
  error?: string;
}

/** Change a user's password (self-service or admin-driven). */
export function changePassword(username: string, newPassword: string): ChangePasswordResult {
  if (newPassword.length < 4) {
    return { success: false, error: "Password must be at least 4 characters." };
  }
  const store = loadStore();
  const user = store.users.find((u) => u.username === username);
  if (!user) {
    return { success: false, error: `User "${username}" not found.` };
  }
  user.passwordHash = hashPassword(newPassword);
  saveStore(store);
  return { success: true };
}
