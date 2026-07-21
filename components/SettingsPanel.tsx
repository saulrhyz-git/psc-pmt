"use client";

/**
 * components/SettingsPanel.tsx
 * -----------------------------------------------------------------------------
 * In-app AI settings modal: lets the user paste API keys and override model
 * names for Claude and Gemini directly from the UI, instead of editing
 * `.env.local` and restarting the dev server. Backed by GET/POST
 * /api/settings (lib/ai-settings.ts). Changes apply on the very next
 * analysis request — no restart needed.
 *
 * Security notes:
 *   - Raw API keys are fetched from the server ONLY once, right after a
 *     successful save-nothing-shown; the GET endpoint never returns raw keys,
 *     only a masked preview (e.g. "AQ.Ab8R••••••ttk05g"). This component
 *     never holds a previously-saved raw key in memory.
 *   - Key inputs are masked (type="password") by default with a show/hide
 *     toggle, and are cleared from local state immediately after a
 *     successful save so a stale value can't linger in the form.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Settings as SettingsIcon,
  Users,
  X,
} from "lucide-react";
import type { AiSettingsResponseBody, ProviderSettingsStatus } from "@/lib/types";
import UserManagement from "@/components/UserManagement";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = "providers" | "users";

interface FormState {
  geminiApiKey: string;
  geminiModel: string;
  claudeApiKey: string;
  claudeModel: string;
  clearGeminiKey: boolean;
  clearClaudeKey: boolean;
}

const EMPTY_FORM: FormState = {
  geminiApiKey: "",
  geminiModel: "",
  claudeApiKey: "",
  claudeModel: "",
  clearGeminiKey: false,
  clearClaudeKey: false,
};

const SOURCE_LABEL: Record<string, string> = {
  settings: "saved in app",
  env: "from environment",
  default: "built-in default",
  none: "not set",
};

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [status, setStatus] = useState<{ gemini: ProviderSettingsStatus; claude: ProviderSettingsStatus } | null>(
    null
  );
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("providers");

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings");
      const payload = (await res.json()) as AiSettingsResponseBody;
      if (!res.ok || !payload.success || !payload.gemini || !payload.claude) {
        throw new Error(payload.error || "Failed to load current settings.");
      }
      setStatus({ gemini: payload.gemini, claude: payload.claude });
      setForm((prev) => ({
        ...prev,
        geminiModel: payload.gemini!.model,
        claudeModel: payload.claude!.model,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load current settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setSavedAt(null);
      setActiveTab("providers");
      void fetchStatus();
    }
  }, [open, fetchStatus]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSavedAt(null);

    const update: Record<string, string> = {};
    if (form.clearGeminiKey) update.geminiApiKey = "";
    else if (form.geminiApiKey.trim()) update.geminiApiKey = form.geminiApiKey.trim();

    if (form.clearClaudeKey) update.claudeApiKey = "";
    else if (form.claudeApiKey.trim()) update.claudeApiKey = form.claudeApiKey.trim();

    if (status && form.geminiModel.trim() !== status.gemini.model) update.geminiModel = form.geminiModel.trim();
    if (status && form.claudeModel.trim() !== status.claude.model) update.claudeModel = form.claudeModel.trim();

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const payload = (await res.json()) as AiSettingsResponseBody;
      if (!res.ok || !payload.success || !payload.gemini || !payload.claude) {
        throw new Error(payload.error || "Failed to save settings.");
      }
      setStatus({ gemini: payload.gemini, claude: payload.claude });
      setForm({
        geminiApiKey: "",
        geminiModel: payload.gemini.model,
        claudeApiKey: "",
        claudeModel: payload.claude.model,
        clearGeminiKey: false,
        clearClaudeKey: false,
      });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }, [form, status]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="settings-panel-title" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <SettingsIcon className="h-4 w-4 text-indigo-600" />
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-200 px-5 pt-2">
          <TabButton active={activeTab === "providers"} onClick={() => setActiveTab("providers")} icon={SettingsIcon}>
            AI Providers
          </TabButton>
          <TabButton active={activeTab === "users"} onClick={() => setActiveTab("users")} icon={Users}>
            Users
          </TabButton>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === "providers" ? (
            <>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading current settings...
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  <ProviderSection
                    title="Google Gemini"
                    subtitle="Recommended for students — free tier via Google AI Studio."
                    getKeyUrl="https://aistudio.google.com/apikey"
                    statusInfo={status?.gemini}
                    apiKeyValue={form.geminiApiKey}
                    onApiKeyChange={(v) => setForm((f) => ({ ...f, geminiApiKey: v, clearGeminiKey: false }))}
                    showKey={showGeminiKey}
                    onToggleShowKey={() => setShowGeminiKey((s) => !s)}
                    clearing={form.clearGeminiKey}
                    onToggleClear={() =>
                      setForm((f) => ({ ...f, clearGeminiKey: !f.clearGeminiKey, geminiApiKey: "" }))
                    }
                    modelValue={form.geminiModel}
                    onModelChange={(v) => setForm((f) => ({ ...f, geminiModel: v }))}
                    modelPlaceholder="gemini-3.5-flash"
                  />

                  <div className="border-t border-slate-100" />

                  <ProviderSection
                    title="Anthropic Claude"
                    subtitle="Pay-as-you-go, no free tier. Optional — only needed if you want Claude available."
                    getKeyUrl="https://console.anthropic.com/settings/keys"
                    statusInfo={status?.claude}
                    apiKeyValue={form.claudeApiKey}
                    onApiKeyChange={(v) => setForm((f) => ({ ...f, claudeApiKey: v, clearClaudeKey: false }))}
                    showKey={showClaudeKey}
                    onToggleShowKey={() => setShowClaudeKey((s) => !s)}
                    clearing={form.clearClaudeKey}
                    onToggleClear={() =>
                      setForm((f) => ({ ...f, clearClaudeKey: !f.clearClaudeKey, claudeApiKey: "" }))
                    }
                    modelValue={form.claudeModel}
                    onModelChange={(v) => setForm((f) => ({ ...f, claudeModel: v }))}
                    modelPlaceholder="claude-3-5-sonnet-20241022"
                  />
                </div>
              )}

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            <UserManagement />
          )}
        </div>

        {activeTab === "providers" && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <div className="text-xs text-slate-400">
              {savedAt ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <Check className="h-3.5 w-3.5" />
                  Saved — takes effect immediately, no restart needed.
                </span>
              ) : (
                "Keys are stored locally in this project, never committed to git."
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Settings
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof SettingsIcon;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
        active ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function ProviderSection({
  title,
  subtitle,
  getKeyUrl,
  statusInfo,
  apiKeyValue,
  onApiKeyChange,
  showKey,
  onToggleShowKey,
  clearing,
  onToggleClear,
  modelValue,
  onModelChange,
  modelPlaceholder,
}: {
  title: string;
  subtitle: string;
  getKeyUrl: string;
  statusInfo?: ProviderSettingsStatus;
  apiKeyValue: string;
  onApiKeyChange: (v: string) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  clearing: boolean;
  onToggleClear: () => void;
  modelValue: string;
  onModelChange: (v: string) => void;
  modelPlaceholder: string;
}) {
  const configured = !!statusInfo?.configured;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <p className="text-[11px] text-slate-500">{subtitle}</p>
        </div>
        <span
          className={[
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
            configured ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
          ].join(" ")}
        >
          {configured ? <Check className="h-3 w-3" /> : null}
          {configured ? `Configured (${SOURCE_LABEL[statusInfo!.keySource]})` : "Not configured"}
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500">API key</span>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={apiKeyValue}
              disabled={clearing}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={
                clearing
                  ? "Will be cleared on save"
                  : statusInfo?.maskedKey
                    ? `${statusInfo.maskedKey} (leave blank to keep)`
                    : "Not set — paste a key to enable this provider"
              }
              className={[
                "w-full rounded-md border px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-1",
                clearing
                  ? "border-red-200 bg-red-50 text-red-400"
                  : "border-slate-200 focus:border-indigo-400 focus:ring-indigo-400",
              ].join(" ")}
            />
            <button
              type="button"
              onClick={onToggleShowKey}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showKey ? "Hide key" : "Show key"}
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          {configured && (
            <button
              type="button"
              onClick={onToggleClear}
              title={clearing ? "Undo clear" : "Clear saved key"}
              className={[
                "flex items-center gap-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                clearing
                  ? "border-red-300 bg-red-50 text-red-600"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50",
              ].join(" ")}
            >
              {clearing ? <RotateCcw className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        <a
          href={getKeyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-fit items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
        >
          Get a {title} API key
          <ExternalLink className="h-3 w-3" />
        </a>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500">
          Model {statusInfo && <span className="text-slate-400">({SOURCE_LABEL[statusInfo.modelSource]})</span>}
        </span>
        <input
          type="text"
          value={modelValue}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder={modelPlaceholder}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </label>
    </div>
  );
}
