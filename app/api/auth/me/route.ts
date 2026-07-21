/**
 * app/api/auth/me/route.ts
 * -----------------------------------------------------------------------------
 * GET /api/auth/me — returns the current session's user (or
 * `authenticated: false`). app/page.tsx calls this on mount to decide whether
 * to render the dashboard or bounce to /login, and to know the user's role
 * (so it can show/hide admin-only UI like user management and AI settings).
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import type { MeResponseBody } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse<MeResponseBody>> {
  const user = await getSessionFromRequest(req);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 200 });
  }
  return NextResponse.json({ authenticated: true, user }, { status: 200 });
}
