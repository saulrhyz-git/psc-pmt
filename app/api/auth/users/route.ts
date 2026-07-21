/**
 * app/api/auth/users/route.ts
 * -----------------------------------------------------------------------------
 * Admin-only enrolled-user management, backing components/UserManagement.tsx.
 *
 * GET    /api/auth/users        — list enrolled users (username, role, createdAt)
 * POST   /api/auth/users        — enroll a new user { username, password, role? }
 * DELETE /api/auth/users        — remove a user { username } (master admin protected)
 * PATCH  /api/auth/users        — change a user's password { username, newPassword }
 *
 * Every method requires an admin session — students cannot see or modify the
 * enrollment list, even for themselves (that's a deliberate simplification:
 * enrollment is admin-managed per the project's requirements).
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { addUser, changePassword, listUsers, removeUser, requireAdmin } from "@/lib/auth";
import type {
  AddUserRequestBody,
  ChangePasswordRequestBody,
  RemoveUserRequestBody,
  UsersListResponseBody,
} from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse<UsersListResponseBody>> {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
  }

  try {
    const users = await listUsers();
    return NextResponse.json({ success: true, users }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/auth/users] GET failed:", err);
    return NextResponse.json({ success: false, error: "Failed to list users." }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<UsersListResponseBody>> {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
  }

  let body: AddUserRequestBody;
  try {
    body = (await req.json()) as AddUserRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body?.username || !body?.password) {
    return NextResponse.json({ success: false, error: "Username and password are required." }, { status: 400 });
  }

  const result = await addUser(body.username, body.password, body.role ?? "student");
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, users: await listUsers() }, { status: 201 });
}

export async function DELETE(req: NextRequest): Promise<NextResponse<UsersListResponseBody>> {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
  }

  let body: RemoveUserRequestBody;
  try {
    body = (await req.json()) as RemoveUserRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body?.username) {
    return NextResponse.json({ success: false, error: "Username is required." }, { status: 400 });
  }

  const result = await removeUser(body.username);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, users: await listUsers() }, { status: 200 });
}

export async function PATCH(req: NextRequest): Promise<NextResponse<UsersListResponseBody>> {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
  }

  let body: ChangePasswordRequestBody;
  try {
    body = (await req.json()) as ChangePasswordRequestBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body?.username || !body?.newPassword) {
    return NextResponse.json({ success: false, error: "Username and newPassword are required." }, { status: 400 });
  }

  const result = await changePassword(body.username, body.newPassword);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, users: await listUsers() }, { status: 200 });
}
