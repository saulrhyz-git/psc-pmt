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

/** Formats a Dimension as a human-readable decimal string, e.g. "13.25 sq m" or "3.20 m". */
export function formatDimension(dim: Dimension, opts?: { asArea?: boolean; precision?: number }): string {
  const precision = opts?.precision ?? defaultPrecision(dim.unit);
  const unitLabel = formatUnitLabel(dim.unit, opts?.asArea);
  return `${dim.value.toFixed(precision)} ${unitLabel}`;
}

function defaultPrecision(unit: MeasurementUnit): number {
  // Metric decimal-meter convention (Philippine architectural practice) wants
  // 2 decimals (e.g. "3.20 m"); centimeters/inches are already fine-grained
  // enough at 0 decimals.
  switch (unit) {
    case "m":
      return 2;
    case "ft":
      return 1;
    case "in":
    case "cm":
      return 0;
    default:
      return 1;
  }
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

/**
 * Formats a single linear Dimension as compound meters + centimeters, e.g.
 * a 3.2m dimension -> "3m 20cm", a 0.15m wall thickness -> "15cm". This is
 * the preferred display format for individual room/furniture/opening
 * dimensions (the app targets Philippine users, where this compound style
 * reads more naturally than decimal meters for a single measurement).
 * Converts from whatever unit the Dimension is stored in first, so it works
 * regardless of the source unit. Not meant for areas or summed totals —
 * use `formatDimension(dim, { asArea: true })` for those.
 */
export function formatMetersCentimeters(dim: Dimension): string {
  const meters = convertDimension(dim, "m").value;
  const sign = meters < 0 ? "-" : "";
  const abs = Math.abs(meters);
  let wholeMeters = Math.floor(abs);
  let cm = Math.round((abs - wholeMeters) * 100);
  if (cm === 100) {
    wholeMeters += 1;
    cm = 0;
  }
  if (wholeMeters === 0) return `${sign}${cm}cm`;
  if (cm === 0) return `${sign}${wholeMeters}m`;
  return `${sign}${wholeMeters}m ${cm}cm`;
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
 * (e.g. "the front door is 0.9 meters wide") measured against its pixel
 * length on the source image.
 */
export function calibrateFromReferenceObject(
  referenceLengthRealM: number,
  referenceLengthPixels: number,
  referenceObjectLabel: string
): ScaleCalibration {
  const unitsPerPixel = referenceLengthRealM / referenceLengthPixels;
  return {
    detected: true,
    unit: "m",
    unitsPerPixel,
    confidence: 0.6,
    method: "door-width-heuristic",
    referenceObject: referenceObjectLabel,
  };
}

/** Standard interior door width used as a fallback calibration reference (in meters). */
export const STANDARD_DOOR_WIDTH_M = 0.9;

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
export function sumRoomAreas(rooms: Room[], targetUnit: MeasurementUnit = "m"): Dimension {
  const total = rooms.reduce((sum, room) => {
    return sum + convertArea(room.area.value, room.area.unit, targetUnit);
  }, 0);
  return { value: round(total, 2), unit: targetUnit };
}

/** Total exterior + interior wall length across a set of wall segments, in a target unit. */
export function sumWallLength(walls: WallSegment[], scale: ScaleCalibration, targetUnit: MeasurementUnit = "m"): Dimension {
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

/** Accessibility-recommended minimum clear width for accessible routes/hallways, in meters. */
export const ADA_MIN_CLEAR_WIDTH_M = 0.915;

/** Recommended minimum egress door clear width, in meters (~32in clear opening). */
export const MIN_EGRESS_DOOR_WIDTH_M = 0.813;

/** Typical minimum functional bedroom area per most residential codes, in sq m. */
export const MIN_BEDROOM_AREA_SQM = 6.5;

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
  const totalAreaSqM = sumRoomAreas(rooms, "m").value;
  const totalWallAreaSqM = rooms.reduce((sum, room) => {
    if (!room.wallSurfaceArea) return sum;
    return sum + convertArea(room.wallSurfaceArea.value, room.wallSurfaceArea.unit, "m");
  }, 0);
  const totalPerimeterM = rooms.reduce((sum, room) => {
    return sum + convertLength(room.perimeter.value, room.perimeter.unit, "m");
  }, 0);

  return {
    totalAreaSqM: round(totalAreaSqM, 2),
    totalWallAreaSqM: round(totalWallAreaSqM, 2),
    totalPerimeterM: round(totalPerimeterM, 2),
    estimatedLaborHours: round(totalAreaSqM * settings.laborHoursPerSqM, 1),
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
