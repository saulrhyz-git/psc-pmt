/**
 * lib/prisma.ts
 * -----------------------------------------------------------------------------
 * Shared PrismaClient singleton, server-only (imports the generated Prisma
 * client, which talks to Postgres over TCP — never import this from a
 * `"use client"` component or from middleware.ts, which runs on the Edge
 * runtime and has no TCP socket access).
 *
 * Standard Next.js + Prisma pattern: cache the client on `globalThis` in
 * development so hot-reloading route handlers doesn't open a fresh
 * connection pool on every file save and eventually exhaust Postgres's
 * connection limit. In production, each server process just creates one.
 * -----------------------------------------------------------------------------
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
