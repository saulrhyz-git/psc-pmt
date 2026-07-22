"use client";

/**
 * components/settings-templates/SettingsTemplatesTool.tsx
 * -----------------------------------------------------------------------------
 * Sidebar tab: Settings & Templates. Two sub-tabs:
 *   - "Templates" (Budget Templates for now) — open to every signed-in user,
 *     same access level as Project Management.
 *   - "Settings" (AI provider keys + user management) — admin-only, same
 *     restriction as the old modal-based Settings panel it replaces.
 * -----------------------------------------------------------------------------
 */

import { useState, type ReactNode } from "react";
import { Layers, Settings as SettingsIcon, ShieldAlert } from "lucide-react";
import AiProviderSettings from "@/components/settings-templates/AiProviderSettings";
import CostEstimateDefaultsSettings from "@/components/settings-templates/CostEstimateDefaultsSettings";
import BudgetTemplateManager from "@/components/settings-templates/BudgetTemplateManager";
import UserManagement from "@/components/UserManagement";

type SubTab = "templates" | "settings";

export default function SettingsTemplatesTool({ isAdmin }: { isAdmin: boolean }) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("templates");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Settings &amp; Templates</h1>
        <p className="text-sm text-slate-500">Reusable templates for repetitive project types, plus app-wide settings.</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <SubTabButton active={activeSubTab === "templates"} onClick={() => setActiveSubTab("templates")} icon={Layers}>
          Templates
        </SubTabButton>
        <SubTabButton active={activeSubTab === "settings"} onClick={() => setActiveSubTab("settings")} icon={SettingsIcon}>
          Settings {!isAdmin && <span className="text-slate-400">(admin)</span>}
        </SubTabButton>
      </div>

      {activeSubTab === "templates" && (
        <div className="flex flex-col gap-8">
          <BudgetTemplateManager />
        </div>
      )}

      {activeSubTab === "settings" &&
        (isAdmin ? (
          <div className="flex flex-col gap-8">
            <AiProviderSettings />
            <div className="border-t border-slate-100 pt-6">
              <CostEstimateDefaultsSettings />
            </div>
            <div>
              <h2 className="mb-3 text-sm font-semibold text-slate-800">User Management</h2>
              <UserManagement />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 p-10 text-center">
            <ShieldAlert className="h-6 w-6 text-slate-400" />
            <p className="text-sm font-medium text-slate-600">Admin access required</p>
            <p className="text-xs text-slate-400">AI provider settings and user management are restricted to admins.</p>
          </div>
        ))}
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Layers;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700",
      ].join(" ")}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}
