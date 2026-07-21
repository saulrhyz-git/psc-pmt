/**
 * lib/estimate-utils.ts
 * -----------------------------------------------------------------------------
 * Pure, isomorphic material/cost estimation logic shared by:
 *   - app/api/estimate/route.ts (server-side computation for persisted estimates)
 *   - components/MaterialEstimator.tsx (instant client-side recalculation as the
 *     contractor edits unit costs, with zero network round-trip)
 *
 * Kept dependency-free from "next/server" so it is safe to import from Client
 * Components — importing the API route module directly into client code would
 * pull in server-only Next.js internals and break the browser bundle.
 * -----------------------------------------------------------------------------
 */

import type { MaterialCategory, MaterialEstimate, MaterialLineItem, Room, UnitCostSettings } from "./types";
import { convertArea, convertLength, generateId, round } from "./measurement-utils";

// Coverage assumptions (industry-standard rules of thumb used to derive raw
// material quantities from measured room areas/perimeters), in metric units
// (this app targets the Philippines, which uses SI units).
const PAINT_SQM_PER_GALLON = 32.5; // ~350 sq ft/gallon per coat, converted to sq m
const PAINT_COATS = 2;
const DRYWALL_SQM_PER_SHEET = 2.88; // standard 1.2m x 2.4m gypsum board sheet
const DRYWALL_WASTE_FACTOR = 1.1;
const FLOORING_WASTE_FACTOR = 1.1;
const TRIM_WASTE_FACTOR = 1.1;

/** Sensible default unit costs shown on first load, before the contractor customizes them. */
export const DEFAULT_UNIT_COST_SETTINGS: UnitCostSettings = {
  paintPerSqM: 6.46,
  drywallPerSqM: 18.84,
  flooringPerSqM: 48.44,
  trimPerLinearM: 7.38,
  laborRatePerHour: 65,
  laborHoursPerSqM: 1.29,
  contingencyPercent: 0.1,
};

/**
 * Computes a full itemized MaterialEstimate for a set of rooms given a
 * UnitCostSettings configuration. Deterministic and side-effect free.
 */
export function computeMaterialEstimate(rooms: Room[], settings: UnitCostSettings): MaterialEstimate {
  const lineItems: MaterialLineItem[] = [];

  for (const room of rooms) {
    if (room.type === "outdoor") continue;

    const floorAreaSqM = convertArea(room.area.value, room.area.unit, "m");
    const wallAreaSqM = room.wallSurfaceArea
      ? convertArea(room.wallSurfaceArea.value, room.wallSurfaceArea.unit, "m")
      : 0;
    const perimeterM = convertLength(room.perimeter.value, room.perimeter.unit, "m");

    if (wallAreaSqM > 0) {
      const paintedSqM = wallAreaSqM * PAINT_COATS;
      const gallons = round(paintedSqM / PAINT_SQM_PER_GALLON, 2);
      lineItems.push(
        makeLineItem({
          category: "paint",
          label: `Paint — ${room.name} (${PAINT_COATS} coats)`,
          quantity: gallons,
          unit: "gallons",
          unitCost: settings.paintPerSqM * PAINT_SQM_PER_GALLON,
          roomId: room.id,
        })
      );
    }

    if (wallAreaSqM > 0) {
      const sheets = Math.ceil((wallAreaSqM * DRYWALL_WASTE_FACTOR) / DRYWALL_SQM_PER_SHEET);
      lineItems.push(
        makeLineItem({
          category: "drywall",
          label: `Drywall — ${room.name} (1.2m x 2.4m sheets)`,
          quantity: sheets,
          unit: "sheets",
          unitCost: settings.drywallPerSqM * DRYWALL_SQM_PER_SHEET,
          roomId: room.id,
        })
      );
    }

    if (floorAreaSqM > 0) {
      const flooringSqM = round(floorAreaSqM * FLOORING_WASTE_FACTOR, 2);
      lineItems.push(
        makeLineItem({
          category: "flooring",
          label: `Flooring — ${room.name}`,
          quantity: flooringSqM,
          unit: "sq_m",
          unitCost: settings.flooringPerSqM,
          roomId: room.id,
        })
      );
    }

    if (perimeterM > 0) {
      const trimM = round(perimeterM * TRIM_WASTE_FACTOR, 2);
      lineItems.push(
        makeLineItem({
          category: "trim",
          label: `Baseboard trim — ${room.name}`,
          quantity: trimM,
          unit: "linear_m",
          unitCost: settings.trimPerLinearM,
          roomId: room.id,
        })
      );
    }

    if (floorAreaSqM > 0) {
      const hours = round(floorAreaSqM * settings.laborHoursPerSqM, 1);
      lineItems.push(
        makeLineItem({
          category: "labor",
          label: `Base labor — ${room.name}`,
          quantity: hours,
          unit: "hours",
          unitCost: settings.laborRatePerHour,
          roomId: room.id,
        })
      );
    }
  }

  const subtotal = round(
    lineItems.reduce((sum, item) => sum + item.total, 0),
    2
  );
  const contingencyAmount = round(subtotal * settings.contingencyPercent, 2);
  const total = round(subtotal + contingencyAmount, 2);

  return {
    currency: "PHP",
    lineItems,
    subtotal,
    contingencyPercent: settings.contingencyPercent,
    contingencyAmount,
    total,
    generatedAt: new Date().toISOString(),
  };
}

function makeLineItem(params: {
  category: MaterialCategory;
  label: string;
  quantity: number;
  unit: MaterialLineItem["unit"];
  unitCost: number;
  roomId?: string;
  notes?: string;
}): MaterialLineItem {
  const quantity = round(params.quantity, 2);
  const unitCost = round(params.unitCost, 2);
  return {
    id: generateId("mat"),
    category: params.category,
    label: params.label,
    quantity,
    unit: params.unit,
    unitCost,
    total: round(quantity * unitCost, 2),
    roomId: params.roomId,
    notes: params.notes,
  };
}
