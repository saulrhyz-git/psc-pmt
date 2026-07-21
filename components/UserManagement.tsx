"use client";

/**
 * components/UserManagement.tsx
 * -----------------------------------------------------------------------------
 * Admin-only enrolled-user management: list, add, and remove student/admin
 * accounts. Backed by GET/POST/DELETE /api/auth/users (lib/auth.ts). Meant to
 * be embedded inside the "Settings" sub-tab of
 * components/settings-templates/SettingsTemplatesTool.tsx — the API routes
 * already enforce admin-only access, but the caller should still avoid
 * mounting this for non-admin sessions.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Shield, Trash2, UserPlus } from "lucide-react";
import type { EnrolledUser, UserRole, UsersListResponseBody } from "@/lib/types";

const MASTER_ADMIN_USERNAME = "saulrhyz";

export default function UserManagement() {
  const [users, setUsers] = useState<EnrolledUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("student");
  const [adding, setAdding] = useState(false);
  const [removingUsername, setRemovingUsername] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/users");
      const payload = (await res.json()) as UsersListResponseBody;
      if (!res.ok || !payload.success || !payload.users) {
        throw new Error(payload.error || "Failed to load users.");
      }
      setUsers(payload.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleAdd = useCallback(async () => {
    if (!newUsername.trim() || !newPassword) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole }),
      });
      const payload = (await res.json()) as UsersListResponseBody;
      if (!res.ok || !payload.success || !payload.users) {
        throw new Error(payload.error || "Failed to add user.");
      }
      setUsers(payload.users);
      setNewUsername("");
      setNewPassword("");
      setNewRole("student");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user.");
    } finally {
      setAdding(false);
    }
  }, [newUsername, newPassword, newRole]);

  const handleRemove = useCallback(async (username: string) => {
    if (username === MASTER_ADMIN_USERNAME) return;
    if (!window.confirm(`Remove "${username}"? They will be signed out immediately.`)) return;

    setRemovingUsername(username);
    setError(null);
    try {
      const res = await fetch("/api/auth/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const payload = (await res.json()) as UsersListResponseBody;
      if (!res.ok || !payload.success || !payload.users) {
        throw new Error(payload.error || "Failed to remove user.");
      }
      setUsers(payload.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove user.");
    } finally {
      setRemovingUsername(null);
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Enrolled Users</h3>
        <p className="text-[11px] text-slate-500">
          Only enrolled users can sign in. The master admin (<code className="rounded bg-slate-100 px-1">{MASTER_ADMIN_USERNAME}</code>) can&apos;t be removed.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Username"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <input
            type="text"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Password"
            className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as UserRole)}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            <option value="student">Student</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newUsername.trim() || !newPassword}
          className="flex items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          Add user
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading users...
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {(users ?? []).map((u) => (
            <li key={u.username} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-slate-700">{u.username}</span>
                {u.role === "admin" && (
                  <span className="flex items-center gap-1 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                    <Shield className="h-2.5 w-2.5" />
                    admin
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(u.username)}
                disabled={u.username === MASTER_ADMIN_USERNAME || removingUsername === u.username}
                title={u.username === MASTER_ADMIN_USERNAME ? "Master admin cannot be removed" : "Remove user"}
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                {removingUsername === u.username ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </li>
          ))}
          {users && users.length === 0 && (
            <li className="px-3 py-4 text-center text-xs text-slate-400">No users found.</li>
          )}
        </ul>
      )}
    </div>
  );
}
