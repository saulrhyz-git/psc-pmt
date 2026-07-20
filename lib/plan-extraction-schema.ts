/**
 * lib/plan-extraction-schema.ts
 * -----------------------------------------------------------------------------
 * Provider-agnostic core of the vision extraction pipeline: the system/user
 * prompts, the JSON schema describing the extraction shape, the raw-output
 * type, and the deterministic post-processing that turns a model's raw
 * geometry extraction into a fully computed PlanAnalysisResult.
 *
 * Both lib/claude-vision.ts (Anthropic) and lib/gemini-vision.ts (Google)
 * import from this module so the two providers stay in lockstep — the same
 * instructions, the same schema, the same math. Only the API call mechanics
 * (how each SDK is invoked and how each returns structured JSON) live in the
 * provider-specific files.
 * -----------------------------------------------------------------------------
 */

import type {
  Dimension,
  FurnitureSuggestion,
  Opening,
  PlanAnalysisResult,
  PlanMetadata,
  Room,
  ScaleCalibration,
  SpacePlanningComment,
  StructuralFixture,
  SVGVectorData,
  VisionProvider,
  WallSegment,
} from "./types";
import {
  computeRoomMeasurements,
  computeWallSurfaceArea,
  generateId,
  polygonCentroid,
  sumRoomAreas,
} from "./measurement-utils";

// -----------------------------------------------------------------------------
// System / user prompt templates (identical across providers)
// -----------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You are a senior architectural drafter and construction estimator with 20+ years of
experience reading blueprints, hand-drawn floor plan sketches, and CAD exports. You are
extremely precise about geometry and never guess a number you cannot justify from the image.

You will be shown an image of a floor plan (which may be a rough hand sketch, a scanned
architectural drawing, or a clean CAD floor plan). Your job is to extract a complete,
structured digital representation of that plan and return it as a single JSON object
matching the required schema exactly — no prose, no markdown fences, JSON only.

Critical rules for extraction:
1. COORDINATE SPACE: Express every point (room polygon vertices, wall endpoints, fixture
   positions, furniture positions) in a normalized coordinate space where the image's
   bounding box maps to a 0-1000 by 0-1000 grid (origin top-left, x increases right,
   y increases down), preserving the true aspect ratio and relative proportions of the
   original plan as closely as possible. Do not output raw pixel coordinates from the
   original image resolution.
2. SCALE CALIBRATION: Look for an explicit scale annotation (e.g. "1/4\\" = 1'-0\\"",
   "1:100", a scale bar, or dimension strings printed on the plan like "12'-6\\""). If
   found, set scaleCalibration.detected = true, fill scaleLabel, and compute
   unitsPerPixel as the real-world unit (feet or meters) represented by ONE unit of your
   0-1000 normalized coordinate space. If no explicit scale exists, use a standard door
   width of 3 feet (36 inches) as a reference object to infer scale, set method to
   "door-width-heuristic", and lower your confidence score accordingly (0.3-0.6). If you
   truly cannot estimate scale, set detected = false, method = "unknown", confidence = 0,
   and unitsPerPixel = 0.01 as a harmless placeholder — do not omit the field.
3. ROOMS: Identify every enclosed room/space including hallways and closets. For each,
   provide a closed polygon (list of points, minimum 3, first point not repeated at the
   end), a best-guess room type, and a descriptive name (use the label on the plan if
   present, otherwise infer from fixtures e.g. "Bedroom 1", "Bathroom").
4. WALLS: Extract straight wall segments as start/end point pairs. Mark exterior walls
   (perimeter of the building) vs interior walls. Approximate wall thickness in feet
   (typically 0.4-0.5 ft for interior, 0.5-0.7 ft for exterior) if not explicitly labeled.
5. OPENINGS: Identify every door and window. Reference the wall it interrupts by matching
   wallId to one of your wall segment ids. Estimate standard widths if unlabeled (interior
   doors ~2.5-3ft, exterior doors ~3ft, windows ~3-4ft).
6. FIXTURES: Identify fixed structural/plumbing/mechanical items (toilets, sinks, tubs,
   showers, kitchen counters/islands, stairs, closets, water heaters, HVAC, fireplaces).
7. SPACE PLANNING: Evaluate traffic flow, door swing clearances, hallway widths against a
   3ft accessibility minimum, room proportions (flag very long/narrow rooms), egress
   (bedrooms should have a door or window), and general layout efficiency. Produce concrete,
   specific comments — not generic advice.
8. FURNITURE SUGGESTIONS: For bedrooms, living rooms, dining rooms, offices and kitchens,
   propose a sensible furniture layout (bed placement away from door swing, sofa facing
   focal point, dining table centered, etc.) with realistic footprints in feet.
9. Never leave required fields empty. If genuinely unknown, use a conservative estimate and
   note the uncertainty in the "warnings" array instead of omitting data.
10. All ids you invent (roomId, wallId, openingId, fixtureId) must be short, unique, stable
    strings (e.g. "room-1", "wall-4", "door-2") — you will reference them across multiple
    sections of your output, so keep them consistent within a single response.
11. Respond with ONLY the JSON object described by the schema. Do not wrap it in markdown
    code fences and do not add any explanatory text before or after it.

Think carefully and look closely at the image before producing your final answer.`;

export function buildUserPrompt(fileName: string, knownScale?: string, referenceMeasurementFt?: number): string {
  const hints: string[] = [];
  if (knownScale) {
    hints.push(`The user has indicated the plan's scale is: "${knownScale}". Prefer this over any heuristic guess.`);
  }
  if (referenceMeasurementFt) {
    hints.push(
      `The user has indicated a known reference measurement of ${referenceMeasurementFt} ft somewhere on the plan (typically the front door or a labeled wall). Use it to sanity-check your scale calibration.`
    );
  }

  return [
    `Analyze the attached architectural floor plan image (source file: "${fileName}").`,
    "Extract complete structured data as a single JSON object matching the required schema.",
    ...hints,
  ].join("\n");
}

// -----------------------------------------------------------------------------
// JSON Schema (shared by Claude's tool `input_schema` and Gemini's
// `responseSchema` — both accept a JSON-Schema-like object with lowercase
// `type` values, `properties`, `required`, `enum`, `items`, `minimum`, etc.,
// so a single definition works for both providers unmodified.)
// -----------------------------------------------------------------------------

const POINT_SCHEMA = {
  type: "object",
  properties: {
    x: { type: "number", description: "0-1000 normalized x coordinate" },
    y: { type: "number", description: "0-1000 normalized y coordinate" },
  },
  required: ["x", "y"],
};

/**
 * The extraction schema, expressed as a plain JSON-Schema object rather than
 * wrapped in a provider-specific "tool" envelope. Provider files add their
 * own thin wrapper (Anthropic.Tool.input_schema / Gemini's responseSchema).
 */
export const PLAN_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    layoutDescription: {
      type: "string",
      description: "2-5 sentence narrative description of the overall layout and room breakdown.",
    },
    planType: {
      type: "string",
      enum: ["floor-plan", "hand-sketch", "architectural-drawing", "site-plan", "unknown"],
    },
    stories: { type: "integer", minimum: 1, description: "Number of stories/floors shown in this plan." },
    notableFeatures: {
      type: "array",
      items: { type: "string" },
      description: "Notable architectural features, e.g. 'vaulted ceiling', 'open-concept kitchen'.",
    },
    scaleCalibration: {
      type: "object",
      properties: {
        detected: { type: "boolean" },
        scaleLabel: { type: "string" },
        unitsPerPixel: {
          type: "number",
          description: "Real-world units (per `unit`) represented by one unit of the 0-1000 normalized coordinate space.",
        },
        unit: { type: "string", enum: ["ft", "in", "m", "cm"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        method: {
          type: "string",
          enum: ["explicit-scale-bar", "explicit-ratio", "door-width-heuristic", "user-provided", "unknown"],
        },
        referenceObject: { type: "string" },
      },
      required: ["detected", "unitsPerPixel", "unit", "confidence", "method"],
    },
    rooms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: {
            type: "string",
            enum: [
              "bedroom", "bathroom", "kitchen", "living-room", "dining-room", "hallway",
              "closet", "garage", "office", "laundry", "utility", "outdoor", "stairwell", "other",
            ],
          },
          polygon: { type: "array", items: POINT_SCHEMA, minItems: 3 },
          ceilingHeightFt: { type: "number", description: "Estimated ceiling height in feet, default 8 if unknown." },
          openingIds: { type: "array", items: { type: "string" } },
          fixtureIds: { type: "array", items: { type: "string" } },
          notes: { type: "string" },
        },
        required: ["id", "name", "type", "polygon", "openingIds", "fixtureIds"],
      },
    },
    walls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          start: POINT_SCHEMA,
          end: POINT_SCHEMA,
          thicknessFt: { type: "number" },
          type: { type: "string", enum: ["exterior", "interior", "load-bearing", "partition", "unknown"] },
          adjacentRoomIds: { type: "array", items: { type: "string" } },
        },
        required: ["id", "start", "end", "thicknessFt", "type", "adjacentRoomIds"],
      },
    },
    openings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["door", "window", "opening", "sliding-door", "double-door", "garage-door"] },
          wallId: { type: "string" },
          positionAlongWall: { type: "number", minimum: 0, maximum: 1 },
          widthFt: { type: "number" },
          swingDirection: {
            type: "string",
            enum: ["left-in", "right-in", "left-out", "right-out", "sliding", "none"],
          },
          label: { type: "string" },
        },
        required: ["id", "type", "wallId", "positionAlongWall", "widthFt"],
      },
    },
    fixtures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: {
            type: "string",
            enum: [
              "toilet", "sink", "bathtub", "shower", "kitchen-counter", "stove", "refrigerator",
              "stairs", "closet", "water-heater", "hvac", "fireplace", "other",
            ],
          },
          roomId: { type: "string" },
          position: POINT_SCHEMA,
          footprintWidthFt: { type: "number" },
          footprintLengthFt: { type: "number" },
          label: { type: "string" },
        },
        required: ["id", "type", "roomId", "position"],
      },
    },
    spacePlanningComments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          category: {
            type: "string",
            enum: [
              "traffic-flow", "door-clearance", "accessibility", "room-proportion",
              "egress", "natural-light", "layout-efficiency", "code-compliance", "other",
            ],
          },
          severity: { type: "string", enum: ["info", "suggestion", "warning", "critical"] },
          roomIds: { type: "array", items: { type: "string" } },
          title: { type: "string" },
          description: { type: "string" },
          recommendation: { type: "string" },
          codeReference: { type: "string" },
        },
        required: ["id", "category", "severity", "roomIds", "title", "description"],
      },
    },
    furnitureSuggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          roomId: { type: "string" },
          type: {
            type: "string",
            enum: [
              "bed-queen", "bed-king", "bed-full", "bed-twin", "sofa", "loveseat", "armchair",
              "coffee-table", "dining-table", "dining-chair", "desk", "office-chair", "dresser",
              "nightstand", "tv-console", "bookshelf", "kitchen-island", "rug", "other",
            ],
          },
          label: { type: "string" },
          footprintWidthFt: { type: "number" },
          footprintLengthFt: { type: "number" },
          position: POINT_SCHEMA,
          rotationDegrees: { type: "number" },
          rationale: { type: "string" },
        },
        required: ["id", "roomId", "type", "label", "footprintWidthFt", "footprintLengthFt", "position", "rotationDegrees"],
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Any uncertainty, illegible sections, or assumptions made during extraction.",
    },
    overallConfidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "layoutDescription", "planType", "stories", "notableFeatures", "scaleCalibration",
    "rooms", "walls", "openings", "fixtures", "spacePlanningComments",
    "furnitureSuggestions", "warnings", "overallConfidence",
  ],
} as const;

// -----------------------------------------------------------------------------
// Raw model-output shape (before post-processing into PlanAnalysisResult)
// -----------------------------------------------------------------------------

export interface RawExtraction {
  layoutDescription: string;
  planType: PlanMetadata["planType"];
  stories: number;
  notableFeatures: string[];
  scaleCalibration: {
    detected: boolean;
    scaleLabel?: string;
    unitsPerPixel: number;
    unit: ScaleCalibration["unit"];
    confidence: number;
    method: ScaleCalibration["method"];
    referenceObject?: string;
  };
  rooms: Array<{
    id: string;
    name: string;
    type: Room["type"];
    polygon: { x: number; y: number }[];
    ceilingHeightFt?: number;
    openingIds: string[];
    fixtureIds: string[];
    notes?: string;
  }>;
  walls: Array<{
    id: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
    thicknessFt: number;
    type: WallSegment["type"];
    adjacentRoomIds: string[];
  }>;
  openings: Array<{
    id: string;
    type: Opening["type"];
    wallId: string;
    positionAlongWall: number;
    widthFt: number;
    swingDirection?: Opening["swingDirection"];
    label?: string;
  }>;
  fixtures: Array<{
    id: string;
    type: StructuralFixture["type"];
    roomId: string;
    position: { x: number; y: number };
    footprintWidthFt?: number;
    footprintLengthFt?: number;
    label?: string;
  }>;
  spacePlanningComments: SpacePlanningComment[];
  furnitureSuggestions: Array<{
    id: string;
    roomId: string;
    type: FurnitureSuggestion["type"];
    label: string;
    footprintWidthFt: number;
    footprintLengthFt: number;
    position: { x: number; y: number };
    rotationDegrees: number;
    rationale?: string;
  }>;
  warnings: string[];
  overallConfidence: number;
}

/** Typed error class shared by every provider so API routes can distinguish config/user/model errors uniformly. */
export class VisionExtractionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "VisionExtractionError";
  }
}

// -----------------------------------------------------------------------------
// Post-processing: raw extraction -> fully computed PlanAnalysisResult
// (identical regardless of which provider produced the raw extraction)
// -----------------------------------------------------------------------------

export function buildPlanAnalysisResult(
  raw: RawExtraction,
  sourceFileName: string,
  provider: VisionProvider
): PlanAnalysisResult {
  const scale: ScaleCalibration = {
    detected: raw.scaleCalibration.detected,
    scaleLabel: raw.scaleCalibration.scaleLabel,
    unitsPerPixel: raw.scaleCalibration.unitsPerPixel || 0.01,
    unit: raw.scaleCalibration.unit || "ft",
    confidence: clamp01(raw.scaleCalibration.confidence),
    method: raw.scaleCalibration.method || "unknown",
    referenceObject: raw.scaleCalibration.referenceObject,
  };

  const walls: WallSegment[] = raw.walls.map((w) => ({
    id: w.id || generateId("wall"),
    start: w.start,
    end: w.end,
    thickness: { value: w.thicknessFt ?? 0.5, unit: "ft" },
    type: w.type || "unknown",
    adjacentRoomIds: w.adjacentRoomIds || [],
  }));

  const openings: Opening[] = raw.openings.map((o) => ({
    id: o.id || generateId("opening"),
    type: o.type,
    wallId: o.wallId,
    positionAlongWall: clamp01(o.positionAlongWall),
    width: { value: o.widthFt ?? 3, unit: "ft" },
    swingDirection: o.swingDirection,
    label: o.label,
  }));

  const fixtures: StructuralFixture[] = raw.fixtures.map((f) => ({
    id: f.id || generateId("fixture"),
    type: f.type,
    roomId: f.roomId,
    position: f.position,
    footprint:
      f.footprintWidthFt && f.footprintLengthFt
        ? {
            width: { value: f.footprintWidthFt, unit: "ft" },
            length: { value: f.footprintLengthFt, unit: "ft" },
          }
        : undefined,
    label: f.label,
  }));

  const rooms: Room[] = raw.rooms.map((r) => {
    const polygon = { points: r.polygon };
    const { area, perimeter } = computeRoomMeasurements(polygon, scale);
    const ceilingHeight: Dimension = { value: r.ceilingHeightFt ?? 8, unit: "ft" };
    const wallSurfaceArea = computeWallSurfaceArea(perimeter, ceilingHeight);

    return {
      id: r.id || generateId("room"),
      name: r.name,
      type: r.type,
      polygon,
      area,
      perimeter,
      wallSurfaceArea,
      ceilingHeight,
      approximateDimensions: estimateBoundingWidthLength(polygon.points, scale),
      openingIds: r.openingIds || [],
      fixtureIds: r.fixtureIds || [],
      labelPosition: polygonCentroid(r.polygon),
      notes: r.notes,
    };
  });

  const furnitureSuggestions: FurnitureSuggestion[] = raw.furnitureSuggestions.map((f) => ({
    id: f.id || generateId("furniture"),
    roomId: f.roomId,
    type: f.type,
    label: f.label,
    footprint: {
      width: { value: f.footprintWidthFt, unit: "ft" },
      length: { value: f.footprintLengthFt, unit: "ft" },
    },
    position: f.position,
    rotation: f.rotationDegrees ?? 0,
    rationale: f.rationale,
  }));

  const totalArea = sumRoomAreas(
    rooms.filter((r) => r.type !== "outdoor"),
    "ft"
  );

  const metadata: PlanMetadata = {
    layoutDescription: raw.layoutDescription,
    planType: raw.planType,
    totalArea,
    totalRoomCount: rooms.length,
    stories: raw.stories || 1,
    notableFeatures: raw.notableFeatures || [],
  };

  const svgVectorData: SVGVectorData = {
    viewBox: "0 0 1000 1000",
    walls,
    openings,
    fixtures,
    rooms,
    dimensionAnnotations: buildDimensionAnnotations(rooms),
    scale,
  };

  return {
    id: generateId("plan"),
    sourceFileName,
    createdAt: new Date().toISOString(),
    provider,
    metadata,
    scaleCalibration: scale,
    rooms,
    walls,
    openings,
    fixtures,
    spacePlanningComments: raw.spacePlanningComments || [],
    furnitureSuggestions,
    svgVectorData,
    overallConfidence: clamp01(raw.overallConfidence),
    warnings: raw.warnings || [],
  };
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Rough width/length bounding box estimate from a polygon, for quick display in tables. */
function estimateBoundingWidthLength(points: { x: number; y: number }[], scale: ScaleCalibration) {
  if (points.length === 0) return undefined;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const unitsPerPixel = scale.unitsPerPixel ?? 1;
  const widthRaw = (Math.max(...xs) - Math.min(...xs)) * unitsPerPixel;
  const lengthRaw = (Math.max(...ys) - Math.min(...ys)) * unitsPerPixel;
  return {
    width: { value: round1(widthRaw), unit: scale.unit },
    length: { value: round1(lengthRaw), unit: scale.unit },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Generates simple width/length dimension annotations along each room's bounding box for the SVG renderer. */
function buildDimensionAnnotations(rooms: Room[]) {
  return rooms.flatMap((room) => {
    if (!room.approximateDimensions) return [];
    const xs = room.polygon.points.map((p) => p.x);
    const ys = room.polygon.points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return [
      {
        id: generateId("dim"),
        start: { x: minX, y: minY - 20 },
        end: { x: maxX, y: minY - 20 },
        value: room.approximateDimensions.width,
        offset: 20,
      },
      {
        id: generateId("dim"),
        start: { x: minX - 20, y: minY },
        end: { x: minX - 20, y: maxY },
        value: room.approximateDimensions.length,
        offset: 20,
      },
    ];
  });
}

/**
 * Attempts to parse a JSON object out of raw model text output. Handles the
 * common case of a provider wrapping the JSON in markdown code fences despite
 * being told not to, and trims any leading/trailing prose defensively.
 */
export function parseJsonFromModelText(text: string): unknown {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1] : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to extracting the outermost {...} block in case of stray text.
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    throw new VisionExtractionError("Model response was not valid JSON and no JSON object could be recovered from it.");
  }
}
