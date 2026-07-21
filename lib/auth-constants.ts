/**
 * lib/auth-constants.ts
 * -----------------------------------------------------------------------------
 * Zero-dependency constants shared between lib/auth.ts (server-only, Node
 * runtime, uses node:fs/node:crypto) and middleware.ts (Edge runtime, no
 * node:fs). middleware.ts must import this file instead of lib/auth.ts
 * directly — importing lib/auth.ts from an Edge file would pull node:fs into
 * the Edge bundle and break the build.
 * -----------------------------------------------------------------------------
 */

export const SESSION_COOKIE_NAME = "pmt_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
