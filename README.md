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

Next.js 14 (App Router) + TypeScript + Tailwind CSS + lucide-react. Vision
extraction is provider-agnostic — pick **Claude** or **Gemini** per request
from the UI:

- **Claude 3.5 Sonnet** via the Anthropic SDK's tool-use / JSON schema mode.
- **Google Gemini** (`gemini-2.5-flash-lite` by default) via `@google/genai`'s
  `responseSchema` / `responseMimeType: "application/json"` structured-output mode.

## Why two providers — a note for classroom / student use

This tool is built so a class of students can use it **without anyone paying
for Anthropic tokens**. Google's Gemini API has a genuinely free tier (Flash
and Flash-Lite models) available through a personal Google account — no
credit card required:

1. Go to https://aistudio.google.com/apikey and create a key.
2. Put it in `.env.local` as `GEMINI_API_KEY`.
3. In the app, select **Google Gemini** in the provider picker before
   analyzing (it's the default).

Free-tier rate limits change over time and aren't worth hardcoding into docs —
check your live quota at https://aistudio.google.com/rate-limit if you hit a
rate-limit error. If a student wants to compare results, Claude remains
available as the second option for anyone with an Anthropic key, but it's
pay-as-you-go with no free tier.

Both providers share the exact same extraction prompt and JSON schema
(`lib/plan-extraction-schema.ts`) and feed the same deterministic measurement
math, so results are directly comparable between the two.

## Setup

```bash
npm install
cp .env.example .env.local
# then edit .env.local and set GEMINI_API_KEY (free) and/or ANTHROPIC_API_KEY (paid)
npm run dev
```

Open http://localhost:3000, pick a provider in the upload panel, and analyze a plan.

### PDF support

PDF uploads are rasterized server-side (first page) with `pdfjs-dist` +
`node-canvas` before being sent to whichever vision provider is selected.
`node-canvas` requires native build tooling (Cairo/Pango); on most systems
`npm install` handles this automatically via prebuilt binaries. If the
`canvas` package fails to build, consult
https://github.com/Automattic/node-canvas#compiling for platform-specific
prerequisites, or restrict uploads to image files (PNG/JPEG/WEBP) in
`components/UploadZone.tsx`.

## Project structure

```
app/
  api/
    analyze/route.ts        # Upload -> PDF rasterization -> provider dispatch -> PlanAnalysisResult
    estimate/route.ts       # Server-side material/cost estimate endpoint
  page.tsx                  # Main dashboard
  layout.tsx
  globals.css
components/
  UploadZone.tsx            # Drag-and-drop upload
  ProviderSelector.tsx      # Claude vs. Gemini picker (free-tier note for Gemini)
  PlanViewer.tsx             # Split-screen original vs. redrawn artifact
  SVGPlanRenderer.tsx        # Interactive SVG plan: pan/zoom, layer toggles, room highlighting
  RoomBreakdownTable.tsx     # Dimensions, areas, space-planning flags
  FurnitureOverlay.tsx       # Furniture suggestion visibility controls
  MaterialEstimator.tsx      # Editable cost/material breakdown
lib/
  plan-extraction-schema.ts  # Shared prompt, JSON schema, and post-processing (provider-agnostic)
  claude-vision.ts            # Anthropic-specific API call mechanics
  gemini-vision.ts            # Gemini-specific API call mechanics
  vision-provider.ts          # Server-side dispatcher: routes to claude-vision or gemini-vision
  vision-provider-metadata.ts # Client-safe provider labels/descriptions (no SDK imports)
  measurement-utils.ts        # Scale calibration + geometry math
  estimate-utils.ts           # Pure material/cost pricing engine (shared client+server)
  types.ts                    # Full TypeScript schema for the whole pipeline
```

## Architecture notes

- **Deterministic math, not model math.** Both providers only extract raw
  geometry (room polygons, wall segments, scale calibration); every
  area/perimeter/cost number is computed in plain TypeScript
  (`lib/measurement-utils.ts`, `lib/estimate-utils.ts`), so results are
  consistent and auditable regardless of which model produced the extraction.
- **One shared schema, two providers.** `lib/plan-extraction-schema.ts` holds
  the system prompt, the JSON schema, and the post-processing pipeline.
  `lib/claude-vision.ts` wraps it in an Anthropic tool call (forced via
  `tool_choice`); `lib/gemini-vision.ts` wraps it in a Gemini
  `responseSchema` structured-output call. Both return an identically-shaped
  `PlanAnalysisResult`, stamped with `provider: "claude" | "gemini"` so the UI
  can show which one ran.
- **Client/server code separation.** `lib/estimate-utils.ts` and
  `lib/vision-provider-metadata.ts` are intentionally dependency-free of both
  `next/server` and the Anthropic/Google SDKs, so they're safe to import
  directly into Client Components (`MaterialEstimator.tsx`,
  `ProviderSelector.tsx`) without bundling server-only code into the browser.
  `lib/vision-provider.ts`, `lib/claude-vision.ts`, and `lib/gemini-vision.ts`
  are server-only and must never be imported from a `"use client"` file.
- **Adding a third provider.** Implement `analyzePlanImageWith<X>` in a new
  `lib/<x>-vision.ts` that imports the shared schema/prompt/post-processing
  from `lib/plan-extraction-schema.ts`, add a case to the switch in
  `lib/vision-provider.ts`, and add an entry to
  `lib/vision-provider-metadata.ts`. No other files need to change.
