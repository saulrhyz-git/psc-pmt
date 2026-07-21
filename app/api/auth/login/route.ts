/**
 * app/api/auth/login/route.ts
 * -----------------------------------------------------------------------------
 * POST /api/auth/login — verify username/password against the local auth
 * store (lib/auth.ts) and, on success, set a signed, HTTP-only session
 * cookie. This route (and logout/me) is excluded from the middleware.ts
 * cookie gate so unauthenticated users can actually reach it.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, login, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import type { LoginRequestBody, LoginResponseBody } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse<LoginResponseBody>> {
  let body: LoginRequestBody;

  try {
    body = (await req.json()) as LoginRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body?.username || !body?.password) {
    return NextResponse.json({ success: false, error: "Username and password are required." }, { status: 400 });
  }

  try {
    const user = await login(body.username, body.password);
    if (!user) {
      return NextResponse.json({ success: false, error: "Invalid username or password." }, { status: 401 });
    }

    const token = await createSessionToken(user.username, user.role);
    const response = NextResponse.json({ success: true, user }, { status: 200 });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/auth/login] failed:", err);
    return NextResponse.json({ success: false, error: "Login failed unexpectedly." }, { status: 500 });
  }
}
