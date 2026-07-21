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
- **Google Gemini** (`gemini-3.5-flash` by default) via `@google/genai`'s
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

## Access control (login required)

Only enrolled users can use the app — every page and API route (except
`/login` and `/api/auth/*`) requires a signed-in session. See `lib/auth.ts`
for the implementation.

- **Master admin account**, seeded automatically the first time the app runs:
  username `saulrhyz`, password `081183`. The password is hashed (scrypt)
  before it's ever written to disk — it's not stored in plaintext anywhere,
  and isn't in this README's git history either (this file only documents
  where to change it, not the live value going forward).
- Credentials and a random session-signing secret live in a local, gitignored
  file, `.auth-users.local.json` (created on first run — see `.gitignore`).
  Delete it to reset everything back to just the seeded master admin.
- **Enrolling students**: sign in as the master admin, open **Settings → Users**,
  and add a username/password per student (role "student"). Students can't
  see or change AI provider settings or manage other users — that's
  admin-only. Change the master admin's own password there too if you want to
  move off `081183`.
- Sessions are HTTP-only signed cookies (30-day expiry), verified with
  Node's built-in `crypto` (`scrypt` for password hashing, HMAC-SHA256 for
  session signing) — no new npm dependency was added for this.
- `middleware.ts` does a fast, Edge-runtime check that a session cookie is
  *present* and redirects to `/login` if not; the actual signature
  verification happens per-request in each Node-runtime API route
  (`requireSession`/`requireAdmin` in `lib/auth.ts`), since Edge middleware
  has no filesystem access to read the auth store.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in (see "Access control" above). You can
then configure API keys two ways:

1. **In-app (recommended for students)** — click **Settings** in the header (or
   "Configure API keys & models" under the provider picker), paste a Gemini
   and/or Claude key, and save. This writes to a local, gitignored file
   (`.ai-settings.local.json`) and takes effect immediately on your next
   analysis — no restart, no editing config files by hand.
2. **Environment variables** — `cp .env.example .env.local` and set
   `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` there. Useful for deployed
   environments where the filesystem is read-only (in-app settings need a
   writable project directory).

If both are set, the in-app Settings panel wins. Model overrides
(`GEMINI_VISION_MODEL` / `CLAUDE_VISION_MODEL`) work the same way and can also
be changed from the Settings panel.

### PDF support

PDF uploads are rasterized server-side (first page, to PNG) with
[`mupdf`](https://www.npmjs.com/package/mupdf) before being sent to whichever
vision provider is selected. `mupdf` is WASM-based — plain `npm install`,
**no native compiler, no system libraries (Cairo/Pango/poppler) needed**,
which matters if your students are on machines without build tooling set up.

An earlier version of this project used `pdfjs-dist` + `node-canvas` for this
step; that combination has a known, currently-unresolved upstream bug
(`TypeError: Image or Canvas expected`) that breaks on any PDF containing an
embedded raster image — see the comment at the top of
`app/api/analyze/route.ts` for the full writeup and links to the relevant
GitHub issues.

**License note:** `mupdf` is AGPL-3.0-or-later (Artifex also sells a
commercial license for anyone who can't comply with AGPL terms — see
https://artifex.com/contact/mupdf-js). That's stricter than the permissive
licenses used elsewhere in this project. Fine for running locally / in a
classroom; worth a second look before offering this as a hosted service to
others.

## Project structure

```
middleware.ts                 # Edge-runtime cookie-presence gate (see "Access control" above)
app/
  login/page.tsx             # Login form (posts to /api/auth/login)
  api/
    analyze/route.ts        # Upload -> PDF rasterization -> provider dispatch -> PlanAnalysisResult
    estimate/route.ts       # Server-side material/cost estimate endpoint
    settings/route.ts       # GET/POST in-app AI settings (admin-only)
    auth/
      login/route.ts        # POST — verify credentials, set session cookie
      logout/route.ts       # POST — clear session cookie
      me/route.ts            # GET — current session user, if any
      users/route.ts         # Admin-only GET/POST/DELETE/PATCH — enrolled user CRUD
  page.tsx                  # Main dashboard
  layout.tsx
  globals.css
components/
  UploadZone.tsx            # Drag-and-drop upload
  ProviderSelector.tsx      # Claude vs. Gemini picker (free-tier note for Gemini)
  SettingsPanel.tsx          # In-app API key / model settings + user management modal (admin-only)
  UserManagement.tsx          # Admin-only: enroll/remove students, list users
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
  ai-settings.ts               # In-app settings store (JSON file) with env-var fallback
  auth.ts                      # Session/user store: scrypt hashing, HMAC session tokens, user CRUD
  auth-constants.ts            # Cookie name/expiry constants shared with Edge middleware
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
- **In-app settings, no restart needed.** `lib/ai-settings.ts` resolves each
  API key/model fresh on every request (settings file → env var → built-in
  default) rather than reading `process.env` once at module load, and
  `lib/claude-vision.ts`/`lib/gemini-vision.ts` build a new SDK client per
  call instead of caching a singleton. That's what lets Settings-panel changes
  take effect immediately. `GET /api/settings` only ever returns masked key
  previews — raw keys travel from browser to server on save and are never
  echoed back.
