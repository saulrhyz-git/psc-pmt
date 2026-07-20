/**
 * lib/measurement-utils.ts
 * -----------------------------------------------------------------------------
 * Scale calibration and geometry/measurement math shared across the API routes
 * and UI. Pure functions only — no side effects, no network calls — so they can
 * be unit tested in isolation and safely imported from both server and client
 * components.
 * -----------------------------------------------------------------------------
 */

import type {
  Dimension,
  MeasurementUnit,
  Point2D,
  Room,
  RoomPolygon,
  ScaleCalibration,
  UnitCostSettings,
  WallSegment,
} from "./types";

// -----------------------------------------------------------------------------
// Unit conversion
// -----------------------------------------------------------------------------

/** Conversion factors from each supported unit to meters (the internal base unit). */
const TO_METERS: Record<MeasurementUnit, number> = {
  ft: 0.3048,
  in: 0.0254,
  m: 1,
  cm: 0.01,
};

/** Converts a numeric value between any two supported linear units. */
export function convertLength(value: number, from: MeasurementUnit, to: MeasurementUnit): number {
  if (from === to) return value;
  const meters = value * TO_METERS[from];
  return meters / TO_METERS[to];
}

/** Converts a Dimension object to a target unit, returning a new Dimension. */
export function convertDimension(dim: Dimension, to: MeasurementUnit): Dimension {
  return {
    value: convertLength(dim.value, dim.unit, to),
    unit: to,
    label: undefined,
  };
}

/** Converts an area value (value^2 relationship) between units. */
export function convertArea(value: number, from: MeasurementUnit, to: MeasurementUnit): number {
  if (from === to) return value;
  const metersFactor = TO_METERS[from] ** 2;
  const targetFactor = TO_METERS[to] ** 2;
  return (value * metersFactor) / targetFactor;
}

/** Formats a Dimension as a human-readable string, e.g. "142.5 sq ft" or "12'-6"". */
export function formatDimension(dim: Dimension, opts?: { asArea?: boolean; precision?: number }): string {
  const precision = opts?.precision ?? 1;
  const unitLabel = formatUnitLabel(dim.unit, opts?.asArea);
  return `${dim.value.toFixed(precision)} ${unitLabel}`;
}

function formatUnitLabel(unit: MeasurementUnit, asArea?: boolean): string {
  const labels: Record<MeasurementUnit, { linear: string; area: string }> = {
    ft: { linear: "ft", area: "sq ft" },
    in: { linear: "in", area: "sq in" },
    m: { linear: "m", area: "sq m" },
    cm: { linear: "cm", area: "sq cm" },
  };
  return asArea ? labels[unit].area : labels[unit].linear;
}

/** Formats a feet value as feet-and-inches, e.g. 12.5 -> `12'-6"`. */
export function formatFeetInches(feet: number): string {
  const wholeFeet = Math.floor(feet);
  const inches = Math.round((feet - wholeFeet) * 12);
  if (inches === 12) {
    return `${wholeFeet + 1}'-0"`;
  }
  return `${wholeFeet}'-${inches}"`;
}

// -----------------------------------------------------------------------------
// Scale calibration
// -----------------------------------------------------------------------------

/**
 * Parses a human-entered architectural scale string like `1/4" = 1'-0"` or
 * `1:100` into a unitsPerPixel-style ratio (real-world units per drawing unit).
 * Returns null if the string cannot be parsed.
 */
export function parseScaleString(scaleLabel: string): { ratio: number; unit: MeasurementUnit } | null {
  const trimmed = scaleLabel.trim();

  // Ratio form, e.g. "1:100" or "1:50"
  const ratioMatch = trimmed.match(/^1\s*:\s*(\d+(\.\d+)?)$/);
  if (ratioMatch) {
    return { ratio: parseFloat(ratioMatch[1]), unit: "m" };
  }

  // Architectural form, e.g. `1/4" = 1'-0"` or `1/2" = 1'`
  const archMatch = trimmed.match(/^(\d+)\/(\d+)"?\s*=\s*(\d+)'(?:-?(\d+)")?$/);
  if (archMatch) {
    const drawingInches = parseInt(archMatch[1], 10) / parseInt(archMatch[2], 10);
    const realFeet = parseInt(archMatch[3], 10) + (archMatch[4] ? parseInt(archMatch[4], 10) / 12 : 0);
    const realInches = realFeet * 12;
    return { ratio: realInches / drawingInches, unit: "in" };
  }

  return null;
}

/**
 * Derives a ScaleCalibration by using a known real-world reference length
 * (e.g. "the front door is 3 feet wide") measured against its pixel length
 * on the source image.
 */
export function calibrateFromReferenceObject(
  referenceLengthRealFt: number,
  referenceLengthPixels: number,
  referenceObjectLabel: string
): ScaleCalibration {
  const unitsPerPixel = referenceLengthRealFt / referenceLengthPixels;
  return {
    detected: true,
    unit: "ft",
    unitsPerPixel,
    confidence: 0.6,
    method: "door-width-heuristic",
    referenceObject: referenceObjectLabel,
  };
}

/** Standard door width used as a fallback calibration reference (in feet). */
export const STANDARD_DOOR_WIDTH_FT = 3;

// -----------------------------------------------------------------------------
// Polygon geometry
// -----------------------------------------------------------------------------

/**
 * Computes the area of a simple polygon using the Shoelace formula.
 * `points` are in normalized plan-space units; the result must be scaled
 * by the calibration factor squared to get real-world area.
 */
export function polygonArea(points: Point2D[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

/** Computes the perimeter (sum of edge lengths) of a simple polygon. */
export function polygonPerimeter(points: Point2D[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    total += distance(current, next);
  }
  return total;
}

/** Euclidean distance between two points. */
export function distance(a: Point2D, b: Point2D): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/** Computes the centroid of a polygon, useful for label placement. */
export function polygonCentroid(points: Point2D[]): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * Given a room polygon expressed in normalized plan-space units and a scale
 * calibration, computes real-world area and perimeter Dimension objects.
 */
export function computeRoomMeasurements(
  polygon: RoomPolygon,
  scale: ScaleCalibration
): { area: Dimension; perimeter: Dimension } {
  const rawArea = polygonArea(polygon.points);
  const rawPerimeter = polygonPerimeter(polygon.points);
  const unitsPerPixel = scale.unitsPerPixel ?? 1;

  const area = rawArea * unitsPerPixel * unitsPerPixel;
  const perimeter = rawPerimeter * unitsPerPixel;

  return {
    area: { value: round(area, 2), unit: scale.unit },
    perimeter: { value: round(perimeter, 2), unit: scale.unit },
  };
}

/** Computes total wall surface area for a room given perimeter and ceiling height. */
export function computeWallSurfaceArea(perimeter: Dimension, ceilingHeight: Dimension): Dimension {
  const heightInPerimeterUnit = convertDimension(ceilingHeight, perimeter.unit);
  return {
    value: round(perimeter.value * heightInPerimeterUnit.value, 2),
    unit: perimeter.unit,
  };
}

/** Sums the floor area of a list of rooms into a single Dimension, normalizing units. */
export function sumRoomAreas(rooms: Room[], targetUnit: MeasurementUnit = "ft"): Dimension {
  const total = rooms.reduce((sum, room) => {
    return sum + convertArea(room.area.value, room.area.unit, targetUnit);
  }, 0);
  return { value: round(total, 2), unit: targetUnit };
}

/** Total exterior + interior wall length across a set of wall segments, in a target unit. */
export function sumWallLength(walls: WallSegment[], scale: ScaleCalibration, targetUnit: MeasurementUnit = "ft"): Dimension {
  const unitsPerPixel = scale.unitsPerPixel ?? 1;
  const total = walls.reduce((sum, wall) => {
    const rawLength = distance(wall.start, wall.end) * unitsPerPixel;
    return sum + convertLength(rawLength, scale.unit, targetUnit);
  }, 0);
  return { value: round(total, 2), unit: targetUnit };
}

// -----------------------------------------------------------------------------
// Space planning heuristics
// -----------------------------------------------------------------------------

/** ADA-recommended minimum clear width for accessible routes/hallways, in feet. */
export const ADA_MIN_CLEAR_WIDTH_FT = 3.0;

/** IBC-recommended minimum egress door clear width, in feet. */
export const MIN_EGRESS_DOOR_WIDTH_FT = 2.67; // 32in clear opening

/** Typical minimum functional bedroom area per most residential codes, in sq ft. */
export const MIN_BEDROOM_AREA_SQFT = 70;

/**
 * Simple aspect-ratio check used to flag oddly-proportioned rooms
 * (e.g. long narrow slivers that are hard to furnish).
 */
export function isAwkwardProportion(width: number, length: number, maxRatio = 3): boolean {
  if (width <= 0 || length <= 0) return false;
  const ratio = Math.max(width, length) / Math.min(width, length);
  return ratio > maxRatio;
}

// -----------------------------------------------------------------------------
// Material estimation math
// -----------------------------------------------------------------------------

/** Computes a base material + labor cost breakdown for a set of rooms. */
export function computeBaseEstimateInputs(rooms: Room[], settings: UnitCostSettings) {
  const totalAreaSqFt = sumRoomAreas(rooms, "ft").value;
  const totalWallAreaSqFt = rooms.reduce((sum, room) => {
    if (!room.wallSurfaceArea) return sum;
    return sum + convertArea(room.wallSurfaceArea.value, room.wallSurfaceArea.unit, "ft");
  }, 0);
  const totalPerimeterFt = rooms.reduce((sum, room) => {
    return sum + convertLength(room.perimeter.value, room.perimeter.unit, "ft");
  }, 0);

  return {
    totalAreaSqFt: round(totalAreaSqFt, 2),
    totalWallAreaSqFt: round(totalWallAreaSqFt, 2),
    totalPerimeterFt: round(totalPerimeterFt, 2),
    estimatedLaborHours: round(totalAreaSqFt * settings.laborHoursPerSqFt, 1),
  };
}

/** Rounds a number to a given decimal precision, avoiding floating point noise. */
export function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/** Generates a short, collision-resistant id for client-side entities (rooms, walls, etc.). */
export function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
