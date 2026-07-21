/**
 * app/api/auth/logout/route.ts
 * -----------------------------------------------------------------------------
 * POST /api/auth/logout — clears the session cookie. Stateless (no
 * server-side session table to invalidate) since sessions are just signed,
 * self-verifying tokens with an expiry baked in.
 * -----------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse<{ success: boolean }>> {
  const response = NextResponse.json({ success: true }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
