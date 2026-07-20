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
// material quantities from measured room areas/perimeters).
const PAINT_SQFT_PER_GALLON = 350;
const PAINT_COATS = 2;
const DRYWALL_SQFT_PER_SHEET = 32; // 4ft x 8ft sheet
const DRYWALL_WASTE_FACTOR = 1.1;
const FLOORING_WASTE_FACTOR = 1.1;
const TRIM_WASTE_FACTOR = 1.1;

/** Sensible default unit costs shown on first load, before the contractor customizes them. */
export const DEFAULT_UNIT_COST_SETTINGS: UnitCostSettings = {
  paintPerSqFt: 0.6,
  drywallPerSqFt: 1.75,
  flooringPerSqFt: 4.5,
  trimPerLinearFt: 2.25,
  laborRatePerHour: 65,
  laborHoursPerSqFt: 0.12,
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

    const floorAreaSqFt = convertArea(room.area.value, room.area.unit, "ft");
    const wallAreaSqFt = room.wallSurfaceArea
      ? convertArea(room.wallSurfaceArea.value, room.wallSurfaceArea.unit, "ft")
      : 0;
    const perimeterFt = convertLength(room.perimeter.value, room.perimeter.unit, "ft");

    if (wallAreaSqFt > 0) {
      const paintedSqFt = wallAreaSqFt * PAINT_COATS;
      const gallons = round(paintedSqFt / PAINT_SQFT_PER_GALLON, 2);
      lineItems.push(
        makeLineItem({
          category: "paint",
          label: `Paint — ${room.name} (${PAINT_COATS} coats)`,
          quantity: gallons,
          unit: "gallons",
          unitCost: settings.paintPerSqFt * PAINT_SQFT_PER_GALLON,
          roomId: room.id,
        })
      );
    }

    if (wallAreaSqFt > 0) {
      const sheets = Math.ceil((wallAreaSqFt * DRYWALL_WASTE_FACTOR) / DRYWALL_SQFT_PER_SHEET);
      lineItems.push(
        makeLineItem({
          category: "drywall",
          label: `Drywall — ${room.name} (4'x8' sheets)`,
          quantity: sheets,
          unit: "sheets",
          unitCost: settings.drywallPerSqFt * DRYWALL_SQFT_PER_SHEET,
          roomId: room.id,
        })
      );
    }

    if (floorAreaSqFt > 0) {
      const flooringSqFt = round(floorAreaSqFt * FLOORING_WASTE_FACTOR, 2);
      lineItems.push(
        makeLineItem({
          category: "flooring",
          label: `Flooring — ${room.name}`,
          quantity: flooringSqFt,
          unit: "sq_ft",
          unitCost: settings.flooringPerSqFt,
          roomId: room.id,
        })
      );
    }

    if (perimeterFt > 0) {
      const trimFt = round(perimeterFt * TRIM_WASTE_FACTOR, 2);
      lineItems.push(
        makeLineItem({
          category: "trim",
          label: `Baseboard trim — ${room.name}`,
          quantity: trimFt,
          unit: "linear_ft",
          unitCost: settings.trimPerLinearFt,
          roomId: room.id,
        })
      );
    }

    if (floorAreaSqFt > 0) {
      const hours = round(floorAreaSqFt * settings.laborHoursPerSqFt, 1);
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
    currency: "USD",
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
