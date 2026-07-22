"use client";

/**
 * components/MaterialEstimator.tsx
 * -----------------------------------------------------------------------------
 * Interactive cost/material breakdown. Contractors can adjust unit costs
 * (paint, drywall, flooring, trim, labor rate/hours, contingency) and see
 * totals recalculate instantly using the same deterministic pricing engine
 * as the server (`computeMaterialEstimate` from app/api/estimate/route.ts),
 * so there's zero drift between the live UI and a persisted server estimate.
 *
 * Controlled component: `settings`/`estimate` live in the parent
 * (components/PlanAnalyzerTool.tsx) rather than here, so the parent always
 * has the current computed Material Estimate available — that's what lets
 * "Add to Project" push whatever's shown in this tab to the project's Cost
 * Estimates, even before the user tweaks anything (the parent seeds
 * `settings` from the admin-configured defaults at GET
 * /api/settings/cost-estimate; see lib/cost-settings.ts).
 * -----------------------------------------------------------------------------
 */

import { useMemo } from "react";
import { Calculator, DollarSign, Download, RotateCcw } from "lucide-react";
import type { MaterialCategory, MaterialEstimate, MaterialLineItem, Room, UnitCostSettings } from "@/lib/types";
import { CURRENCY_SYMBOL, formatCurrency } from "@/lib/currency-utils";

interface MaterialEstimatorProps {
  rooms: Room[];
  settings: UnitCostSettings;
  onSettingsChange: (next: UnitCostSettings) => void;
  onResetDefaults: () => void;
  estimate: MaterialEstimate | null;
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

/** Short explanation of how each category's quantity is derived, shown under the category heading. */
const CATEGORY_FORMULAS: Record<MaterialCategory, string> = {
  paint: "Gallons = (wall area × 2 coats) ÷ 32.5 m² per gallon coverage. Total = gallons × cost/gallon.",
  drywall: "Sheets = ceil(wall area × 1.1 waste ÷ 2.88 m² per 1.2m × 2.4m sheet). Total = sheets × cost/sheet.",
  flooring: "Quantity = floor area × 1.1 waste factor. Total = sq m × cost/sq m.",
  trim: "Quantity = room perimeter × 1.1 waste factor. Total = linear m × cost/linear m.",
  labor: "Hours = floor area × labor hours/sq m rate. Total = hours × hourly rate.",
  other: "Total = quantity × unit cost.",
};

export default function MaterialEstimator({ rooms, settings, onSettingsChange, onResetDefaults, estimate }: MaterialEstimatorProps) {
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
    onSettingsChange({ ...settings, [key]: value });
  };

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
            onClick={onResetDefaults}
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="h-3 w-3" />
            Reset defaults
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <CostInput label={`Paint (${CURRENCY_SYMBOL}/sq m)`} value={settings.paintPerSqM} onChange={(v) => updateSetting("paintPerSqM", v)} />
          <CostInput label={`Drywall (${CURRENCY_SYMBOL}/sq m)`} value={settings.drywallPerSqM} onChange={(v) => updateSetting("drywallPerSqM", v)} />
          <CostInput label={`Flooring (${CURRENCY_SYMBOL}/sq m)`} value={settings.flooringPerSqM} onChange={(v) => updateSetting("flooringPerSqM", v)} />
          <CostInput label={`Trim (${CURRENCY_SYMBOL}/linear m)`} value={settings.trimPerLinearM} onChange={(v) => updateSetting("trimPerLinearM", v)} />
          <CostInput label={`Labor rate (${CURRENCY_SYMBOL}/hr)`} value={settings.laborRatePerHour} onChange={(v) => updateSetting("laborRatePerHour", v)} />
          <CostInput
            label="Labor hrs / sq m"
            value={settings.laborHoursPerSqM}
            step={0.01}
            onChange={(v) => updateSetting("laborHoursPerSqM", v)}
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

          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Item</span>
            <span className="w-24 text-right">Quantity</span>
            <span className="w-20 text-right">Unit Cost</span>
            <span className="w-24 text-right">Total</span>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {CATEGORY_ORDER.filter((cat) => groupedByCategory.has(cat)).map((category) => (
              <div key={category}>
                <div className="sticky top-0 bg-slate-100 px-4 py-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{CATEGORY_LABELS[category]}</p>
                  <p className="text-[10.5px] font-normal normal-case text-slate-400">{CATEGORY_FORMULAS[category]}</p>
                </div>
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {groupedByCategory.get(category)!.map((item) => (
                      <tr key={item.id}>
                        <td className="w-1/2 px-4 py-2 text-slate-700">{item.label}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                          {item.quantity} {formatUnit(item.unit)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-500">{formatCurrency(item.unitCost)}</td>
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

          <p className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-400">
            Total = Quantity × Unit Cost for each line item. Quantities are derived from the analyzed room
            geometry; see the formula under each category above.
          </p>

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
