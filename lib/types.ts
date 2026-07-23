/**
 * lib/types.ts
 * -----------------------------------------------------------------------------
 * Full TypeScript type system for the AI Architectural Plan Analyzer & Redrawer.
 * These types define the contract between:
 *   - Claude Vision analysis output (lib/claude-vision.ts)
 *   - API routes (app/api/analyze, app/api/estimate)
 *   - UI components (SVGPlanRenderer, RoomBreakdownTable, MaterialEstimator, etc.)
 *
 * Every field that can be produced by the vision model is explicitly typed and
 * marked required/optional to keep the Claude structured-output schema and the
 * TypeScript types in lockstep.
 * -----------------------------------------------------------------------------
 */

// -----------------------------------------------------------------------------
// Primitive / shared geometry types
// -----------------------------------------------------------------------------

/** Supported real-world measurement units for display and calculation. */
export type MeasurementUnit = "ft" | "in" | "m" | "cm";

/** Supported input file kinds accepted by the upload zone. */
export type SupportedInputMimeType =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "application/pdf";

/** A 2D point in the normalized SVG coordinate space (0-1000 viewBox by convention). */
export interface Point2D {
  x: number;
  y: number;
}

/** A single dimension/measurement value, always paired with its unit for safety. */
export interface Dimension {
  /** Raw numeric value in `unit`. */
  value: number;
  /** Unit the value is expressed in. */
  unit: MeasurementUnit;
  /** Optional human-readable label, e.g. `12'-6"`. */
  label?: string;
}

/** Width x Length dimension pair, commonly used for rooms and furniture footprints. */
export interface WidthLength {
  width: Dimension;
  length: Dimension;
}

/**
 * Scale calibration data extracted (or inferred) from the source plan.
 * Used to convert pixel/drawing-unit measurements into real-world units.
 */
export interface ScaleCalibration {
  /** True if an explicit scale bar, ratio, or annotation was found on the plan. */
  detected: boolean;
  /** Human readable scale, e.g. `1/4" = 1'-0"` or `1:100`. */
  scaleLabel?: string;
  /** Number of real-world units represented by one drawing/pixel unit. */
  unitsPerPixel?: number;
  /** The unit that `unitsPerPixel` is expressed in. */
  unit: MeasurementUnit;
  /** Confidence score 0-1 for the calibration accuracy. */
  confidence: number;
  /** Method used to derive the scale (explicit label, door-width heuristic, etc.). */
  method: "explicit-scale-bar" | "explicit-ratio" | "door-width-heuristic" | "user-provided" | "unknown";
  /** If a known reference object (e.g. standard door) was used to infer scale. */
  referenceObject?: string;
}

// -----------------------------------------------------------------------------
// Structural elements: walls, openings, fixtures
// -----------------------------------------------------------------------------

export type WallType = "exterior" | "interior" | "load-bearing" | "partition" | "unknown";

/** A single straight wall segment defined by two endpoints in normalized plan space. */
export interface WallSegment {
  id: string;
  start: Point2D;
  end: Point2D;
  /** Wall thickness in the calibrated unit (defaults to `ft`/`m` per project settings). */
  thickness: Dimension;
  type: WallType;
  /** IDs of rooms this wall borders (1 for exterior, up to 2 for interior). */
  adjacentRoomIds: string[];
}

export type OpeningType = "door" | "window" | "opening" | "sliding-door" | "double-door" | "garage-door";

/**
 * A door, window, or generic opening placed along a wall.
 */
export interface Opening {
  id: string;
  type: OpeningType;
  /** ID of the wall segment this opening is embedded in. */
  wallId: string;
  /** Position along the wall from `start`, expressed 0-1 (normalized). */
  positionAlongWall: number;
  /** Physical width of the opening. */
  width: Dimension;
  /** Swing direction for doors, if determinable. */
  swingDirection?: "left-in" | "right-in" | "left-out" | "right-out" | "sliding" | "none";
  /** Required clearance radius for accessibility/code checks. */
  clearance?: Dimension;
  label?: string;
}

export type FixtureType =
  | "toilet"
  | "sink"
  | "bathtub"
  | "shower"
  | "kitchen-counter"
  | "stove"
  | "refrigerator"
  | "stairs"
  | "closet"
  | "water-heater"
  | "hvac"
  | "fireplace"
  | "other";

/** Fixed structural/plumbing/mechanical fixtures detected on the plan. */
export interface StructuralFixture {
  id: string;
  type: FixtureType;
  roomId: string;
  position: Point2D;
  footprint?: WidthLength;
  label?: string;
}

// -----------------------------------------------------------------------------
// Rooms
// -----------------------------------------------------------------------------

export type RoomType =
  | "bedroom"
  | "bathroom"
  | "kitchen"
  | "living-room"
  | "dining-room"
  | "hallway"
  | "closet"
  | "garage"
  | "office"
  | "laundry"
  | "utility"
  | "outdoor"
  | "stairwell"
  | "other";

/** Polygon footprint of a room in normalized plan coordinates. */
export interface RoomPolygon {
  points: Point2D[];
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  polygon: RoomPolygon;
  /** Calculated floor area. */
  area: Dimension;
  /** Calculated perimeter length. */
  perimeter: Dimension;
  /** Total interior wall surface area (perimeter x ceiling height), if ceiling height known. */
  wallSurfaceArea?: Dimension;
  /** Approximate bounding dimensions (useful for quick display). */
  approximateDimensions?: WidthLength;
  ceilingHeight?: Dimension;
  /** IDs of openings (doors/windows) bordering this room. */
  openingIds: string[];
  /** IDs of fixtures located in this room. */
  fixtureIds: string[];
  /** Centroid used for label placement in the SVG renderer. */
  labelPosition: Point2D;
  notes?: string;
}

// -----------------------------------------------------------------------------
// Space planning / code compliance
// -----------------------------------------------------------------------------

export type SpacePlanningSeverity = "info" | "suggestion" | "warning" | "critical";

export type SpacePlanningCategory =
  | "traffic-flow"
  | "door-clearance"
  | "accessibility"
  | "room-proportion"
  | "egress"
  | "natural-light"
  | "layout-efficiency"
  | "code-compliance"
  | "other";

/**
 * A single space-planning or code-compliance observation, e.g. "hallway width
 * below ADA minimum" or "kitchen work triangle inefficient".
 */
export interface SpacePlanningComment {
  id: string;
  category: SpacePlanningCategory;
  severity: SpacePlanningSeverity;
  /** Room(s) this comment applies to, if scoped. */
  roomIds: string[];
  title: string;
  description: string;
  /** Optional actionable recommendation. */
  recommendation?: string;
  /** Relevant code reference, e.g. "IBC 1010.1.1" or "ADA 404.2.3", if applicable. */
  codeReference?: string;
}

// -----------------------------------------------------------------------------
// Furniture suggestions
// -----------------------------------------------------------------------------

export type FurnitureType =
  | "bed-queen"
  | "bed-king"
  | "bed-full"
  | "bed-twin"
  | "sofa"
  | "loveseat"
  | "armchair"
  | "coffee-table"
  | "dining-table"
  | "dining-chair"
  | "desk"
  | "office-chair"
  | "dresser"
  | "nightstand"
  | "tv-console"
  | "bookshelf"
  | "kitchen-island"
  | "rug"
  | "other";

export interface FurnitureSuggestion {
  id: string;
  roomId: string;
  type: FurnitureType;
  label: string;
  footprint: WidthLength;
  /** Suggested top-left anchor position + rotation in normalized plan coordinates. */
  position: Point2D;
  /** Rotation in degrees, clockwise from north. */
  rotation: number;
  rationale?: string;
  /** Clearance space this item requires to remain functional/code-compliant. */
  requiredClearance?: Dimension;
}

// -----------------------------------------------------------------------------
// SVG / vector redraw data
// -----------------------------------------------------------------------------

/** Names of togglable rendering layers in SVGPlanRenderer. */
export type PlanLayer = "walls" | "labels" | "dimensions" | "furniture" | "fixtures" | "grid";

/** A dimension annotation line (the little arrows + text showing room widths). */
export interface DimensionAnnotation {
  id: string;
  start: Point2D;
  end: Point2D;
  value: Dimension;
  /** Offset distance from the measured edge, in normalized units. */
  offset: number;
}

/**
 * Complete vector representation of the redrawn, cleaned-up plan.
 * This is what SVGPlanRenderer consumes to draw the artifact.
 */
export interface SVGVectorData {
  /** Normalized viewBox, e.g. "0 0 1000 800". */
  viewBox: string;
  walls: WallSegment[];
  openings: Opening[];
  fixtures: StructuralFixture[];
  rooms: Room[];
  dimensionAnnotations: DimensionAnnotation[];
  /** Pixels-per-unit ratio used when the vector data was generated, for reference. */
  scale: ScaleCalibration;
}

// -----------------------------------------------------------------------------
// Material / cost estimation
// -----------------------------------------------------------------------------

export type MaterialCategory =
  | "paint"
  | "drywall"
  | "flooring"
  | "trim"
  | "labor"
  | "other";

export interface MaterialLineItem {
  id: string;
  category: MaterialCategory;
  label: string;
  /** Quantity in the unit specified by `unit` (e.g. sq m, gallons/liters, linear m). */
  quantity: number;
  unit: "sq_ft" | "sq_m" | "gallons" | "liters" | "sheets" | "linear_ft" | "linear_m" | "hours" | "each";
  /** Editable unit cost, in PHP (Philippine Peso) by default — see lib/currency-utils.ts. */
  unitCost: number;
  /** quantity * unitCost, kept denormalized for convenience; recomputed on edit. */
  total: number;
  roomId?: string;
  notes?: string;
}

export interface MaterialEstimate {
  currency: string;
  lineItems: MaterialLineItem[];
  subtotal: number;
  /** Contingency percentage applied (e.g. 0.10 for 10%). */
  contingencyPercent: number;
  contingencyAmount: number;
  total: number;
  generatedAt: string;
}

/** Default unit costs, editable by the contractor in MaterialEstimator. */
export interface UnitCostSettings {
  paintPerSqM: number;
  drywallPerSqM: number;
  flooringPerSqM: number;
  trimPerLinearM: number;
  laborRatePerHour: number;
  /** Estimated labor hours per sq m of floor area, used for base labor estimate. */
  laborHoursPerSqM: number;
  contingencyPercent: number;
}

// -----------------------------------------------------------------------------
// Top-level analysis result (Claude Vision output contract)
// -----------------------------------------------------------------------------

export interface PlanMetadata {
  /** Overall narrative description of the layout. */
  layoutDescription: string;
  /** Detected or inferred plan type. */
  planType: "floor-plan" | "hand-sketch" | "architectural-drawing" | "site-plan" | "unknown";
  totalArea: Dimension;
  totalRoomCount: number;
  stories: number;
  /** Free-text list of notable architectural features. */
  notableFeatures: string[];
}

export interface PlanAnalysisResult {
  id: string;
  sourceFileName: string;
  createdAt: string;
  /** Which vision provider produced this extraction (stamped by lib/vision-provider.ts). */
  provider: VisionProvider;
  metadata: PlanMetadata;
  scaleCalibration: ScaleCalibration;
  rooms: Room[];
  walls: WallSegment[];
  openings: Opening[];
  fixtures: StructuralFixture[];
  spacePlanningComments: SpacePlanningComment[];
  furnitureSuggestions: FurnitureSuggestion[];
  svgVectorData: SVGVectorData;
  /** Populated by /api/estimate after the user requests a cost estimate. */
  materialEstimate?: MaterialEstimate;
  /** Raw confidence score for the overall extraction, 0-1. */
  overallConfidence: number;
  warnings: string[];
}

// -----------------------------------------------------------------------------
// Vision provider selection
// -----------------------------------------------------------------------------

/**
 * Which AI vision backend performs the plan extraction. Claude and Gemini
 * both implement the same extraction contract (see lib/plan-extraction-schema.ts)
 * so results are shaped identically regardless of which one is selected.
 * Gemini is included specifically so cost-sensitive users (e.g. students) can
 * run the tool on Google's free tier instead of a paid Anthropic key.
 */
export type VisionProvider = "claude" | "gemini" | "kimi";

export interface VisionProviderInfo {
  id: VisionProvider;
  label: string;
  description: string;
  /** Shown in the UI as a cost/budget hint. */
  costNote: string;
  requiredEnvVar: string;
  getApiKeyUrl: string;
}

// -----------------------------------------------------------------------------
// API request/response envelopes
// -----------------------------------------------------------------------------

export interface AnalyzeRequestBody {
  /** Base64-encoded file data (without data URL prefix). */
  fileBase64: string;
  fileName: string;
  mimeType: SupportedInputMimeType;
  /** Which vision provider to use for this analysis request. */
  provider: VisionProvider;
  /** Optional user-provided scale hint, e.g. "1/4in = 1ft". */
  knownScale?: string;
  /** Optional user-provided reference measurement (in meters) to aid calibration. */
  referenceMeasurementM?: number;
  /**
   * Optional free-text context supplied by the user (e.g. "this is a 2-story
   * duplex, focus on the ground floor" or "client wants an open-concept
   * kitchen"). Passed straight through to the vision model's user prompt —
   * see lib/plan-extraction-schema.ts's buildUserPrompt.
   */
  context?: string;
}

export interface AnalyzeResponseBody {
  success: boolean;
  result?: PlanAnalysisResult;
  error?: string;
}

export interface EstimateRequestBody {
  planAnalysisId: string;
  rooms: Room[];
  unitCostSettings: UnitCostSettings;
}

export interface EstimateResponseBody {
  success: boolean;
  estimate?: MaterialEstimate;
  error?: string;
}

// -----------------------------------------------------------------------------
// In-app AI settings (API keys + model overrides configurable from the UI —
// see lib/ai-settings.ts, app/api/settings/route.ts,
// components/settings-templates/AiProviderSettings.tsx)
// -----------------------------------------------------------------------------

/** Raw shape persisted to the local settings file. Server-only — never sent to the client as-is. */
export interface StoredAiSettings {
  geminiApiKey?: string;
  geminiModel?: string;
  claudeApiKey?: string;
  claudeModel?: string;
  kimiApiKey?: string;
  kimiModel?: string;
}

/** Where a currently-active setting value came from, surfaced in the Settings UI. */
export type SettingSource = "settings" | "env" | "default" | "none";

export interface ResolvedSetting {
  value: string | undefined;
  source: SettingSource;
}

/** Client-safe status for one provider — never includes the raw API key. */
export interface ProviderSettingsStatus {
  configured: boolean;
  keySource: SettingSource;
  /** Masked preview of the active key, e.g. "AQ.Ab8R••••••ttk05g". Omitted if not configured. */
  maskedKey?: string;
  model: string;
  modelSource: SettingSource;
}

export interface AiSettingsResponseBody {
  success: boolean;
  gemini?: ProviderSettingsStatus;
  claude?: ProviderSettingsStatus;
  kimi?: ProviderSettingsStatus;
  error?: string;
}

/**
 * POST body for updating settings. Per-field semantics:
 *   - field omitted → leave the existing stored value untouched
 *   - field is a non-empty string → overwrite
 *   - field is an empty string `""` → explicitly clear (revert to env/default)
 */
export type AiSettingsUpdateBody = Partial<StoredAiSettings>;

// -----------------------------------------------------------------------------
// Admin-configured default unit costs for the Material/Cost Estimator — see
// lib/cost-settings.ts, app/api/settings/cost-estimate/route.ts,
// components/settings-templates/CostEstimateDefaultsSettings.tsx
// -----------------------------------------------------------------------------

export interface CostEstimateDefaultsResponseBody {
  success: boolean;
  settings?: UnitCostSettings;
  error?: string;
}

/** POST body: any subset of UnitCostSettings fields; omitted fields keep their current stored value. */
export type CostEstimateDefaultsUpdateBody = Partial<UnitCostSettings>;

// -----------------------------------------------------------------------------
// Authentication (login-gated access — see lib/auth.ts, app/api/auth/*,
// app/login/page.tsx, components/UserManagement.tsx)
// -----------------------------------------------------------------------------

export type UserRole = "admin" | "student";

/** Client-safe user record — never includes the password hash. */
export interface SessionUser {
  username: string;
  role: UserRole;
}

/** Client-safe enrolled-user record for the admin's user management list. */
export interface EnrolledUser {
  username: string;
  role: UserRole;
  createdAt: string;
}

export interface LoginRequestBody {
  username: string;
  password: string;
}

export interface LoginResponseBody {
  success: boolean;
  user?: SessionUser;
  error?: string;
}

export interface MeResponseBody {
  authenticated: boolean;
  user?: SessionUser;
}

export interface UsersListResponseBody {
  success: boolean;
  users?: EnrolledUser[];
  error?: string;
}

export interface AddUserRequestBody {
  username: string;
  password: string;
  role?: UserRole;
}

export interface RemoveUserRequestBody {
  username: string;
}

export interface ChangePasswordRequestBody {
  username: string;
  newPassword: string;
}

// -----------------------------------------------------------------------------
// App shell (sidebar navigation between tools — see components/Sidebar.tsx)
// -----------------------------------------------------------------------------

export type AppTool = "plan-analyzer" | "project-management" | "settings-templates";

// -----------------------------------------------------------------------------
// UI state helpers
// -----------------------------------------------------------------------------

export interface UploadedFileState {
  file: File;
  previewUrl: string;
  mimeType: SupportedInputMimeType;
}

export type AnalysisStatus = "idle" | "uploading" | "analyzing" | "success" | "error";
