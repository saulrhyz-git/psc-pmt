"use client";

/**
 * components/settings-templates/CostEstimateDefaultsSettings.tsx
 * -----------------------------------------------------------------------------
 * Admin-only control for the default unit costs shown when anyone opens the
 * Material/Cost Estimator (components/MaterialEstimator.tsx) for a newly
 * analyzed plan. Embedded in the "Settings" sub-tab of Settings & Templates,
 * alongside AiProviderSettings — same access level, same rationale (a shared,
 * app-wide default that shouldn't be editable by every signed-in user).
 * Backed by GET/POST /api/settings/cost-estimate (lib/cost-settings.ts).
 * -----------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Calculator, Check, Loader2, RotateCcw } from "lucide-react";
import type { CostEstimateDefaultsResponseBody, UnitCostSettings } from "@/lib/types";
import { CURRENCY_SYMBOL } from "@/lib/currency-utils";
import { DEFAULT_UNIT_COST_SETTINGS } from "@/lib/estimate-utils";

export default function CostEstimateDefaultsSettings() {
  const [settings, setSettings] = useState<UnitCostSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/cost-estimate");
      const payload = (await res.json()) as CostEstimateDefaultsResponseBody;
      if (!res.ok || !payload.success || !payload.settings) {
        throw new Error(payload.error || "Failed to load cost estimate defaults.");
      }
      setSettings(payload.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cost estimate defaults.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const updateField = (key: keyof UnitCostSettings, value: number) => {
    if (Number.isNaN(value) || value < 0) return;
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch("/api/settings/cost-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const payload = (await res.json()) as CostEstimateDefaultsResponseBody;
      if (!res.ok || !payload.success || !payload.settings) {
        throw new Error(payload.error || "Failed to save cost estimate defaults.");
      }
      setSettings(payload.settings);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cost estimate defaults.");
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const resetToBuiltIn = () => setSettings({ ...DEFAULT_UNIT_COST_SETTINGS });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Calculator className="h-4 w-4 text-emerald-600" />
            Cost Estimate Defaults
          </h3>
          <p className="text-[11px] text-slate-500">
            Starting unit costs everyone sees when they open the Material/Cost Estimator for a newly analyzed plan.
            Each user can still adjust these live in their own session — this only sets the starting point.
          </p>
        </div>
        {!loading && settings && (
          <button
            type="button"
            onClick={resetToBuiltIn}
            className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to built-in
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading current defaults...
        </div>
      ) : settings ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <CostInput
              label={`Paint (${CURRENCY_SYMBOL}/sq m)`}
              value={settings.paintPerSqM}
              onChange={(v) => updateField("paintPerSqM", v)}
            />
            <CostInput
              label={`Drywall (${CURRENCY_SYMBOL}/sq m)`}
              value={settings.drywallPerSqM}
              onChange={(v) => updateField("drywallPerSqM", v)}
            />
            <CostInput
              label={`Flooring (${CURRENCY_SYMBOL}/sq m)`}
              value={settings.flooringPerSqM}
              onChange={(v) => updateField("flooringPerSqM", v)}
            />
            <CostInput
              label={`Trim (${CURRENCY_SYMBOL}/linear m)`}
              value={settings.trimPerLinearM}
              onChange={(v) => updateField("trimPerLinearM", v)}
            />
            <CostInput
              label={`Labor rate (${CURRENCY_SYMBOL}/hr)`}
              value={settings.laborRatePerHour}
              onChange={(v) => updateField("laborRatePerHour", v)}
            />
            <CostInput
              label="Labor hrs / sq m"
              value={settings.laborHoursPerSqM}
              step={0.01}
              onChange={(v) => updateField("laborHoursPerSqM", v)}
            />
            <CostInput
              label="Contingency (%)"
              value={settings.contingencyPercent * 100}
              step={1}
              onChange={(v) => updateField("contingencyPercent", v / 100)}
            />
          </div>
        </div>
      ) : null}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && settings && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {savedAt ? (
              <span className="flex items-center gap-1 text-emerald-600">
                <Check className="h-3.5 w-3.5" />
                Saved — new estimates will start from these values.
              </span>
            ) : (
              "Applies the next time someone opens the Cost Estimate tab for a plan."
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save Defaults
          </button>
        </div>
      )}
    </div>
  );
}

function CostInput({
  label,
  value,
  onChange,
  step = 0.05,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full rounded-md border border-slate-200 py-1.5 pl-2 pr-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
    </label>
  );
}
