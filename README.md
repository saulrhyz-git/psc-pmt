# AI Architectural Plan Analyzer & Redrawer

Tool #1 of the construction multitool web app. Upload a blueprint, hand sketch,
or architectural drawing (image or PDF) and get:

1. A narrative layout description and room breakdown.
2. Automated area, perimeter, and wall-surface calculations with scale calibration.
3. Space-planning and code-compliance review (traffic flow, door clearance, accessibility, room proportions).
4. AI-suggested furniture layouts per room.
5. A clean, redrawn, interactive SVG plan with pan/zoom and layer toggles (walls, labels, dimensions, furniture).
6. A material and cost estimator with editable unit costs.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind CSS + lucide-react, with
Claude 3.5 Sonnet (`claude-3-5-sonnet-20241022`) doing structured-output vision
extraction via the Anthropic SDK's tool-use / JSON schema mode.

## Setup

```bash
npm install
cp .env.example .env.local
# then edit .env.local and set ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000.

### PDF support

PDF uploads are rasterized server-side (first page) with `pdfjs-dist` +
`node-canvas` before being sent to Claude Vision. `node-canvas` requires native
build tooling (Cairo/Pango); on most systems `npm install` handles this
automatically via prebuilt binaries. If the `canvas` package fails to build,
consult https://github.com/Automattic/node-canvas#compiling for platform-specific
prerequisites, or restrict uploads to image files (PNG/JPEG/WEBP) in
`components/UploadZone.tsx`.

## Project structure

```
app/
  api/
    analyze/route.ts     # Upload -> PDF rasterization -> Claude Vision -> PlanAnalysisResult
    estimate/route.ts    # Server-side material/cost estimate endpoint
  page.tsx                # Main dashboard
  layout.tsx
  globals.css
components/
  UploadZone.tsx           # Drag-and-drop upload
  PlanViewer.tsx           # Split-screen original vs. redrawn artifact
  SVGPlanRenderer.tsx       # Interactive SVG plan: pan/zoom, layer toggles, room highlighting
  RoomBreakdownTable.tsx    # Dimensions, areas, space-planning flags
  FurnitureOverlay.tsx      # Furniture suggestion visibility controls
  MaterialEstimator.tsx     # Editable cost/material breakdown
lib/
  claude-vision.ts          # Anthropic SDK call + structured extraction schema
  measurement-utils.ts      # Scale calibration + geometry math
  estimate-utils.ts         # Pure material/cost pricing engine (shared client+server)
  types.ts                  # Full TypeScript schema for the whole pipeline
```

## Architecture notes

- **Deterministic math, not model math.** Claude extracts raw geometry (room
  polygons, wall segments, scale calibration) but every area/perimeter/cost
  number is computed in plain TypeScript (`lib/measurement-utils.ts`,
  `lib/estimate-utils.ts`), so results are consistent and auditable regardless
  of the model's arithmetic.
- **Forced tool use.** `lib/claude-vision.ts` calls the Messages API with
  `tool_choice: { type: "tool", name: "extract_plan_data" }` against a strict
  JSON schema, which is far more reliable than prompting for freeform JSON.
- **Client/server code separation.** `lib/estimate-utils.ts` is imported by
  both the API route and `MaterialEstimator.tsx` (a Client Component) for
  instant live recalculation. It intentionally has no dependency on
  `next/server`, unlike `app/api/estimate/route.ts` itself, which must never be
  imported from client code.
