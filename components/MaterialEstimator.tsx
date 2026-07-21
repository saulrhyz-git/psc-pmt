"use client";

/**
 * components/MaterialEstimator.tsx
 * -----------------------------------------------------------------------------
 * Interactive cost/material breakdown. Contractors can adjust unit costs
 * (paint, drywall, flooring, trim, labor rate/hours, contingency) and see
 * totals recalculate instantly using the same deterministic pricing engine
 * as the server (`computeMaterialEstimate` from app/api/estimate/route.ts),
 * so there's zero drift between the live UI and a persisted server estimate.
 * -----------------------------------------------------------------------------
 */

import { useMemo, useState } from "react";
import { Calculator, DollarSign, Download, RotateCcw } from "lucide-react";
import type { MaterialCategory, MaterialLineItem, Room, UnitCostSettings } from "@/lib/types";
import { computeMaterialEstimate, DEFAULT_UNIT_COST_SETTINGS } from "@/lib/estimate-utils";
import { CURRENCY_SYMBOL, formatCurrency } from "@/lib/currency-utils";

interface MaterialEstimatorProps {
  rooms: Room[];
  initialSettings?: UnitCostSettings;
}

const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  paint: "Paint",
  drywall: "Drywall",
  flooring: "Flooring",
  trim: "Trim",
  labor: "Labor",
  other: "Other",
};

const CATEGORY_ORDER: MaterialCategory[] = ["paint", "drywall", "flooring", "trim", "labor", "other"];

export default function MaterialEstimator({ rooms, initialSettings }: MaterialEstimatorProps) {
  const [settings, setSettings] = useState<UnitCostSettings>(initialSettings ?? DEFAULT_UNIT_COST_SETTINGS);

  const estimate = useMemo(() => {
    if (rooms.length === 0) return null;
    try {
      return computeMaterialEstimate(rooms, settings);
    } catch {
      return null;
    }
  }, [rooms, settings]);

  const groupedByCategory = useMemo(() => {
    const map = new Map<MaterialCategory, MaterialLineItem[]>();
    if (!estimate) return map;
    for (const item of estimate.lineItems) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [estimate]);

  const updateSetting = (key: keyof UnitCostSettings, value: number) => {
    if (Number.isNaN(value) || value < 0) return;
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetDefaults = () => setSettings(DEFAULT_UNIT_COST_SETTINGS);

  const exportCsv = () => {
    if (!estimate) return;
    const header = ["Category", "Item", "Quantity", "Unit", "Unit Cost", "Total"];
    const rows = estimate.lineItems.map((i) => [
      CATEGORY_LABELS[i.category],
      i.label,
      i.quantity.toString(),
      i.unit,
      i.unitCost.toFixed(2),
      i.total.toFixed(2),
    ]);
    rows.push(["", "", "", "", "Subtotal", estimate.subtotal.toFixed(2)]);
    rows.push(["", "", "", "", `Contingency (${(estimate.contingencyPercent * 100).toFixed(0)}%)`, estimate.contingencyAmount.toFixed(2)]);
    rows.push(["", "", "", "", "Total", estimate.total.toFixed(2)]);

    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "material-estimate.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (rooms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        <Calculator className="h-6 w-6 text-slate-400" />
        Analyze a plan to generate a material and cost estimate.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Unit cost controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            Unit Costs
          </h3>
          <button
            type="button"
            onClick={resetDefaults}
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="h-3 w-3" />
            Reset defaults
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <CostInput label={`Paint (${CURRENCY_SYMBOL}/sq ft)`} value={settings.paintPerSqFt} onChange={(v) => updateSetting("paintPerSqFt", v)} />
          <CostInput label={`Drywall (${CURRENCY_SYMBOL}/sq ft)`} value={settings.drywallPerSqFt} onChange={(v) => updateSetting("drywallPerSqFt", v)} />
          <CostInput label={`Flooring (${CURRENCY_SYMBOL}/sq ft)`} value={settings.flooringPerSqFt} onChange={(v) => updateSetting("flooringPerSqFt", v)} />
          <CostInput label={`Trim (${CURRENCY_SYMBOL}/linear ft)`} value={settings.trimPerLinearFt} onChange={(v) => updateSetting("trimPerLinearFt", v)} />
          <CostInput label={`Labor rate (${CURRENCY_SYMBOL}/hr)`} value={settings.laborRatePerHour} onChange={(v) => updateSetting("laborRatePerHour", v)} />
          <CostInput
            label="Labor hrs / sq ft"
            value={settings.laborHoursPerSqFt}
            step={0.01}
            onChange={(v) => updateSetting("laborHoursPerSqFt", v)}
          />
          <CostInput
            label="Contingency (%)"
            value={settings.contingencyPercent * 100}
            step={1}
            onChange={(v) => updateSetting("contingencyPercent", v / 100)}
          />
        </div>
      </div>

      {/* Line item table */}
      {estimate && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-800">Itemized Estimate</h3>
            <button
              type="button"
              onClick={exportCsv}
              className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Download className="h-3 w-3" />
              Export CSV
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {CATEGORY_ORDER.filter((cat) => groupedByCategory.has(cat)).map((category) => (
              <div key={category}>
                <div className="sticky top-0 bg-slate-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {CATEGORY_LABELS[category]}
                </div>
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {groupedByCategory.get(category)!.map((item) => (
                      <tr key={item.id}>
                        <td className="w-1/2 px-4 py-2 text-slate-700">{item.label}</td>
                        <td className="px-2 py-2 tabular-nums text-slate-500">
                          {item.quantity} {formatUnit(item.unit)}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-slate-500">{formatCurrency(item.unitCost)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">
                          {formatCurrency(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <div className="space-y-1 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(estimate.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Contingency ({(estimate.contingencyPercent * 100).toFixed(0)}%)</span>
              <span className="tabular-nums">{formatCurrency(estimate.contingencyAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-slate-900">
              <span>Total Estimate</span>
              <span className="tabular-nums">{formatCurrency(estimate.total)}</span>
            </div>
          </div>
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
      <div className="relative">
        <input
          type="number"
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full rounded-md border border-slate-200 py-1.5 pl-2 pr-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
      </div>
    </label>
  );
}

function formatUnit(unit: string): string {
  const map: Record<string, string> = {
    sq_ft: "sq ft",
    sq_m: "sq m",
    linear_ft: "lin ft",
    linear_m: "lin m",
    gallons: "gal",
    liters: "L",
    sheets: "sheets",
    hours: "hrs",
    each: "ea",
  };
  return map[unit] ?? unit;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
