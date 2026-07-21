/**
 * middleware.ts
 * -----------------------------------------------------------------------------
 * Coarse route gate for the login system. Runs on Next.js 14's Edge runtime,
 * which has no filesystem access (no `node:fs`) — so it can only check that a
 * session cookie is *present*, not fully verify its HMAC signature (that
 * requires lib/auth.ts's `verifySessionToken`, which reads the auth store off
 * disk and only runs in Node-runtime Route Handlers).
 *
 * This means middleware alone is not sufficient authorization — it just keeps
 * logged-out users from loading the app shell / hitting API routes without a
 * cookie at all. Every API route that touches real data (analyze, estimate,
 * settings, users) independently calls `verifySessionToken` server-side via
 * `requireSession`/`requireAdmin` in lib/auth.ts equivalents in each route —
 * that's the actual authorization boundary. Treat this file as UX (fast
 * redirect to /login), not security.
 * -----------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "./lib/auth-constants";

export function middleware(request: NextRequest) {
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const { pathname } = request.nextUrl;

  if (!hasSessionCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match everything except:
     * - /login (the login page itself)
     * - /api/auth/* (login/logout/me must be reachable while logged out)
     * - Next.js internals and static assets
     */
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
