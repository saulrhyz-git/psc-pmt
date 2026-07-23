# Construction Multitool

A small suite of construction tools behind a single login, navigated from a
collapsible sidebar. All monetary values default to the **Philippine Peso
(₱)** — see `lib/currency-utils.ts`.

- **Tool #1 — AI Plan Analyzer & Redrawer**: upload a blueprint and get an
  AI-driven layout analysis, redraw, and cost estimate.
- **Tool #2 — Project Management**: track multiple construction projects —
  tasks, schedule, budget, and crew/equipment resources.
- **Settings & Templates**: AI provider settings and user management
  (admin-only), plus reusable templates (Budget templates for now) that any
  signed-in user can create and apply to a project's budget in one click.

## Tool #1: AI Plan Analyzer & Redrawer

Upload a blueprint, hand sketch, or architectural drawing (image or PDF) and get:

1. A narrative layout description and room breakdown.
2. Automated area, perimeter, and wall-surface calculations with scale calibration.
3. Space-planning and code-compliance review (traffic flow, door clearance, accessibility, room proportions).
4. AI-suggested furniture layouts per room.
5. A clean, redrawn, interactive SVG plan with pan/zoom and layer toggles (walls, labels, dimensions, furniture).
6. A material and cost estimator with editable unit costs.

Two more inputs/outputs sit around the core analysis:

- **Context field** — optional free text ("this is a 2-bedroom bungalow, client wants an open-concept kitchen") sent straight through to the vision model's prompt alongside the image, so the AI factors it into the layout description, space-planning review, and furniture suggestions.
- **Add to Project** — after a successful analysis, save it to a Project Management project in one click. This persists the full result (viewable later from that project's **Plan Analyses** tab) and generates a PDF report that's automatically added to the project's **Reference Files** library. See "Reference Files & Plan Analyses" under Tool #2 below.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind CSS + lucide-react. Vision
extraction is provider-agnostic — pick **Claude**, **Gemini**, or **Kimi**
per request from the UI:

- **Claude 3.5 Sonnet** via the Anthropic SDK's tool-use / JSON schema mode.
- **Google Gemini** (`gemini-3.5-flash` by default) via `@google/genai`'s
  `responseSchema` / `responseMimeType: "application/json"` structured-output mode.
- **Kimi K3** (Moonshot AI) via a plain `fetch()` call to its
  OpenAI-Chat-Completions-compatible API, using forced function-calling for
  structured output. No extra SDK dependency — see `lib/kimi-vision.ts`.

## Why multiple providers — a note for classroom / student use

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
rate-limit error. If a student wants to compare results, Claude and Kimi
remain available as paid options for anyone with an API key, but both are
pay-as-you-go with no free tier.

All three providers share the exact same extraction prompt and JSON schema
(`lib/plan-extraction-schema.ts`) and feed the same deterministic measurement
math, so results are directly comparable across all of them.

## Access control (login required)

Only enrolled users can use the app — every page and API route (except
`/login` and `/api/auth/*`) requires a signed-in session. See `lib/auth.ts`
for the implementation.

- **Master admin account**, seeded automatically the first time the app runs:
  username `saulrhyz`, password `081183`. The password is hashed (scrypt)
  before it's ever written to disk — it's not stored in plaintext anywhere,
  and isn't in this README's git history either (this file only documents
  where to change it, not the live value going forward).
- Credentials and a random session-signing secret live in Postgres (the
  `users` and `app_secret` tables — see `prisma/schema.prisma` and "Database
  (Postgres)" below). Truncate those tables (or drop and re-migrate the
  database) to reset everything back to just the seeded master admin.
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

## Database (Postgres)

Every stateful feature (auth, AI settings, projects, templates) is backed by
Postgres via [Prisma](https://www.prisma.io/) — see `prisma/schema.prisma`
for the full schema and `lib/prisma.ts` for the shared client singleton.

1. Have a Postgres server reachable from this machine (local install, Docker,
   or a hosted instance).
2. `cp .env.example .env.local` and set `DATABASE_URL` to your connection
   string, e.g.:
   ```
   DATABASE_URL="postgresql://username:password@localhost:5432/construction_multitool"
   ```
3. Run the migrations once to create all tables:
   ```bash
   npm run db:migrate
   ```
   (`npm run db:deploy` applies existing migrations without prompting —
   use that in CI/production instead of `db:migrate`.)
4. `npm run db:studio` opens Prisma Studio, a GUI for browsing/editing rows
   directly, if you want to inspect the data.

The master admin account (`saulrhyz` / `081183`) is seeded automatically into
the `users` table the first time the app talks to an empty database — no
manual seeding step required.

## Setup

```bash
npm install
# set DATABASE_URL in .env.local and run `npm run db:migrate` — see
# "Database (Postgres)" above — before starting the dev server
npm run dev
```

Open http://localhost:3000 and sign in (see "Access control" above). You can
then configure API keys two ways:

1. **In-app (recommended for students)** — open the **Settings & Templates**
   tab in the sidebar (or "Configure API keys & models" under the provider
   picker on the Plan Analyzer tab), paste a Gemini, Claude, and/or Kimi key
   under its **Settings** sub-tab, and save. This writes to the `ai_settings`
   table in Postgres and takes effect immediately on your next analysis — no
   restart, no editing config files by hand.
2. **Environment variables** — set `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` /
   `KIMI_API_KEY` in `.env.local`. Useful as a fallback, or for deployed
   environments where you'd rather not put provider keys in the database.

If both are set, the in-app settings win. Model overrides
(`GEMINI_VISION_MODEL` / `CLAUDE_VISION_MODEL` / `KIMI_VISION_MODEL`) work the
same way and can also be changed from the Settings sub-tab. (The AI Providers
and Users sub-tab content is admin-only — see "Access control" above.)

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

## Tool #2: Project Management

Manage multiple construction projects from one dashboard, selected via a
dropdown at the top of the tab:

1. **Multiple projects** — create a project with name, project in charge,
   client name, date started, target completion, project type, address,
   total budget, status, and notes.
2. **Dashboard KPIs** — active tasks, overall progress, budget burn, and
   active crew count, computed live from the project's tasks/budget/crew
   (`lib/project-kpi-utils.ts`).
3. **Task Management** — searchable, filterable (status/phase) task list with
   progress bars, status badges, priority, assignee, and inline quick edits.
4. **Gantt Timeline** — a custom, dependency-free schedule view (no charting
   library) built from each task's start/end dates, color-coded by phase.
5. **Budget Tracker** — total spend vs. total budget, plus a phase-by-phase
   breakdown of budgeted/spent/remaining per line item. Add line items one at
   a time, or apply a saved Budget template to bulk-add a whole skeleton in
   one click (see "Settings & Templates" below) — handy for repetitive
   project types.
6. **Resource Management** — crew allocation cards (role, % allocation,
   status) and an equipment status table (type, status, assigned to).
7. **Data Export** — one-click Excel export (`GET /api/projects/:id/export`)
   with a separate worksheet per project overview, tasks, budget, crew, and
   equipment, built with SheetJS (`xlsx` on npm, Apache-2.0 license).

**Access control**: per an explicit product decision, every enrolled user
(admin or student) can create and edit projects, tasks, budget, and resources
for now — it's a shared working tool, not a security boundary. Role-based
restrictions (e.g. view-only for students) are a planned future enhancement
— see the header comment in `lib/project-types.ts`.

**Storage**: Postgres, same as every other stateful feature — the `projects`,
`tasks`, `budget_line_items`, `crew_members`, and `equipment` tables (see
`prisma/schema.prisma` and `lib/project-store.ts`). Deleting a project cascades
to its tasks/budget/crew/equipment automatically via foreign-key
`onDelete: Cascade` — no manual cleanup code needed.

### Reference Files & Plan Analyses

Two more per-project tabs, populated either manually or by Tool #1:

- **Reference Files** — a per-project document library (spec sheets, code
  excerpts, client notes, anything worth keeping alongside the job). Upload
  any file type; it's stored as raw bytes directly in Postgres (`reference_files`
  table, see `lib/reference-file-store.ts`) — no separate object storage.
- **Plan Analyses** — every AI Plan Analyzer result saved to this project via
  "Add to Project" (`plan_analyses` table, storing the full `PlanAnalysisResult`
  as `jsonb`, see `lib/plan-analysis-store.ts`). Click one to reopen the room
  breakdown, redrawn plan, and furniture suggestions exactly as they appeared
  in the Analyzer.

"Add to Project" does both in one atomic transaction: it writes the
`PlanAnalysis` row, renders a PDF report of the analysis with
[`pdfkit`](https://www.npmjs.com/package/pdfkit) (`lib/plan-analysis-pdf.ts`),
and adds that PDF as a `ReferenceFile` linked back to the analysis via
`sourceAnalysisId`. Deleting the saved analysis later does **not** delete its
PDF (`onDelete: SetNull`) — once a report is in the reference library it
stands on its own. Deleting the whole project cascades to both.

## Settings & Templates

A sidebar tab with two sub-tabs:

- **Templates** — open to every signed-in user. Create a **Budget template**
  (a name plus a list of phase/category/budgeted-amount line items) once, then
  apply it to any project's Budget tab in one click — new line items are
  added with `spent` starting at ₱0, additively (applying twice, or applying
  on top of manually-added items, never overwrites existing line items).
  Stored in Postgres (the `budget_templates` / `budget_template_line_items`
  tables, see `lib/template-store.ts`). More template types (e.g. Task
  templates) can be added later following the same pattern.
- **Settings** — admin-only: AI provider API keys/models (`AiProviderSettings.tsx`,
  formerly a gear-icon modal, now embedded here) and user management
  (`UserManagement.tsx`). Students see an "admin access required" placeholder
  instead.

## Project structure

```
prisma/
  schema.prisma              # Postgres schema for every stateful feature (Prisma)
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
    projects/
      route.ts               # GET list / POST create a project
      [id]/route.ts           # GET/PATCH/DELETE a project (cascades on delete)
      [id]/bundle/route.ts    # GET project + tasks + budget + crew + equipment in one call
      [id]/tasks/route.ts + [taskId]/route.ts       # Task CRUD
      [id]/budget/route.ts + [lineItemId]/route.ts  # Budget line item CRUD
      [id]/budget/apply-template/route.ts           # POST — bulk-apply a Budget template
      [id]/crew/route.ts + [memberId]/route.ts      # Crew CRUD
      [id]/equipment/route.ts + [itemId]/route.ts   # Equipment CRUD
      [id]/export/route.ts    # GET — one-click Excel export (SheetJS)
      [id]/reference-files/route.ts + [fileId]/route.ts   # Reference file library CRUD (upload/list/download/delete)
      [id]/plan-analyses/route.ts + [analysisId]/route.ts # Saved Plan Analyses: list/create ("Add to Project")/get/delete
      [id]/cost-estimates/route.ts + [estimateId]/route.ts # Saved Cost Estimates: list/create ("Add to Project" or PM tab)/get/update (PATCH, live edits)/delete
    settings/
      cost-estimate/route.ts  # GET (any user) / POST (admin) — default unit costs for the Cost Estimator
    templates/
      budget/route.ts         # GET list / POST create a Budget template
      budget/[id]/route.ts    # PATCH/DELETE a Budget template
  page.tsx                  # App shell: session gate, sidebar, top bar, active-tool switch
  layout.tsx
  globals.css
components/
  Sidebar.tsx                # Collapsible nav: Plan Analyzer / Project Management / Settings & Templates
  PlanAnalyzerTool.tsx        # Tool #1's full UI (extracted from app/page.tsx)
  AddToProjectModal.tsx       # "Add to Project" flow: picks a project, POSTs the result
  UploadZone.tsx            # Drag-and-drop upload
  ProviderSelector.tsx      # Claude vs. Gemini vs. Kimi picker (free-tier note for Gemini)
  UserManagement.tsx          # Admin-only: enroll/remove students, list users
  PlanViewer.tsx             # Split-screen original vs. redrawn artifact
  SVGPlanRenderer.tsx        # Interactive SVG plan: pan/zoom, layer toggles, room highlighting
  RoomBreakdownTable.tsx     # Dimensions, areas, space-planning flags
  FurnitureOverlay.tsx       # Furniture suggestion visibility controls
  MaterialEstimator.tsx      # Editable cost/material breakdown
  pm/
    ProjectManagementTool.tsx # Tool #2's orchestrator: project picker + sub-tabs
    AddProjectModal.tsx       # New project form
    KpiCards.tsx               # Dashboard KPI strip
    TaskList.tsx                # Searchable/filterable task table
    GanttChart.tsx              # Custom CSS-based schedule timeline
    BudgetTracker.tsx           # Budget vs. spend + phase breakdown + "Apply Template"
    ResourceManagement.tsx      # Crew cards + equipment table
    ExportButton.tsx            # Triggers the Excel export download
    StatusBadge.tsx             # Shared status pill (task/project/crew/equipment)
    phase-colors.ts             # Deterministic phase -> color mapping
    ReferenceFileLibrary.tsx    # Per-project reference file upload/list/download/delete
    PlanAnalysesList.tsx        # Saved Plan Analyses list + detail view (reuses Tool #1's viewer components)
    CostEstimatesList.tsx       # Saved Cost Estimates list + detail view reusing MaterialEstimator as a live, editable calculator (falls back to read-only for pre-roomsJson estimates)
  settings-templates/
    SettingsTemplatesTool.tsx   # Sidebar tab orchestrator: Templates / Settings sub-tabs
    AiProviderSettings.tsx      # AI provider keys/models (admin-only, no modal chrome)
    CostEstimateDefaultsSettings.tsx  # Default unit costs for the Cost Estimator (admin-only to edit)
    BudgetTemplateManager.tsx   # Create/edit/delete Budget templates
lib/
  plan-extraction-schema.ts  # Shared prompt, JSON schema, and post-processing (provider-agnostic)
  claude-vision.ts            # Anthropic-specific API call mechanics
  gemini-vision.ts            # Gemini-specific API call mechanics
  kimi-vision.ts               # Moonshot AI (Kimi) API call mechanics — plain fetch(), OpenAI-compatible
  vision-provider.ts          # Server-side dispatcher: routes to claude-vision, gemini-vision, or kimi-vision
  vision-provider-metadata.ts # Client-safe provider labels/descriptions (no SDK imports)
  prisma.ts                    # Shared PrismaClient singleton (dev-mode hot-reload safe)
  ai-settings.ts               # In-app settings store (Postgres) with env-var fallback
  cost-settings.ts             # Admin-configured default unit costs for the Cost Estimator (Postgres)
  auth.ts                      # Session/user store: scrypt hashing, HMAC session tokens, user CRUD (Postgres)
  auth-constants.ts            # Cookie name/expiry constants shared with Edge middleware
  measurement-utils.ts        # Scale calibration + geometry math
  estimate-utils.ts           # Pure material/cost pricing engine (shared client+server)
  currency-utils.ts            # Shared PHP (₱) currency formatter used app-wide
  project-types.ts             # Tool #2's TypeScript schema (client-safe, no fs/SDK imports)
  project-store.ts             # Tool #2's server-only Postgres persistence + CRUD
  project-kpi-utils.ts         # Pure KPI math over a ProjectBundle (client-safe)
  template-types.ts            # Templates' TypeScript schema (client-safe)
  template-store.ts            # Templates' server-only Postgres persistence + CRUD
  reference-file-types.ts      # Reference Files' TypeScript schema (client-safe)
  reference-file-store.ts      # Reference Files' server-only Postgres persistence (bytea) + CRUD
  plan-analysis-types.ts       # Saved Plan Analyses' TypeScript schema (client-safe)
  plan-analysis-store.ts       # Saved Plan Analyses' server-only Postgres persistence ("Add to Project")
  plan-analysis-pdf.ts         # Renders a PlanAnalysisResult to a PDF report (pdfkit)
  cost-estimate-types.ts       # Saved Cost Estimates' TypeScript schema (client-safe)
  cost-estimate-store.ts       # Saved Cost Estimates' server-only Postgres persistence ("Add to Project" or PM tab)
  types.ts                    # Full TypeScript schema for Tool #1 + the app shell
```

## Architecture notes

- **Deterministic math, not model math.** All providers only extract raw
  geometry (room polygons, wall segments, scale calibration); every
  area/perimeter/cost number is computed in plain TypeScript
  (`lib/measurement-utils.ts`, `lib/estimate-utils.ts`), so results are
  consistent and auditable regardless of which model produced the extraction.
- **One shared schema, three providers.** `lib/plan-extraction-schema.ts` holds
  the system prompt, the JSON schema, and the post-processing pipeline.
  `lib/claude-vision.ts` wraps it in an Anthropic tool call (forced via
  `tool_choice`); `lib/gemini-vision.ts` wraps it in a Gemini
  `responseSchema` structured-output call; `lib/kimi-vision.ts` wraps it in a
  forced OpenAI-style function call over a plain `fetch()` to Moonshot's
  Chat-Completions-compatible API. All three return an identically-shaped
  `PlanAnalysisResult`, stamped with `provider: "claude" | "gemini" | "kimi"`
  so the UI can show which one ran.
- **Client/server code separation.** `lib/estimate-utils.ts` and
  `lib/vision-provider-metadata.ts` are intentionally dependency-free of both
  `next/server` and the Anthropic/Google SDKs, so they're safe to import
  directly into Client Components (`MaterialEstimator.tsx`,
  `ProviderSelector.tsx`) without bundling server-only code into the browser.
  `lib/vision-provider.ts`, `lib/claude-vision.ts`, `lib/gemini-vision.ts`, and
  `lib/kimi-vision.ts` are server-only and must never be imported from a
  `"use client"` file.
- **Adding a fourth provider.** Implement `analyzePlanImageWith<X>` in a new
  `lib/<x>-vision.ts` that imports the shared schema/prompt/post-processing
  from `lib/plan-extraction-schema.ts`, add a case to the switch in
  `lib/vision-provider.ts`, add an entry to `lib/vision-provider-metadata.ts`,
  extend `VisionProvider` in `lib/types.ts`, and add the key/model fields to
  `lib/ai-settings.ts` + the `AiSettings` Prisma model + `AiProviderSettings.tsx`
  (see `lib/kimi-vision.ts` for a from-scratch, dependency-free example using
  a plain `fetch()` instead of an SDK).
- **In-app settings, no restart needed.** `lib/ai-settings.ts` resolves each
  API key/model fresh on every request (settings file → env var → built-in
  default) rather than reading `process.env` once at module load, and
  `lib/claude-vision.ts`/`lib/gemini-vision.ts` build a new SDK client per
  call instead of caching a singleton. That's what lets Settings-panel changes
  take effect immediately. `GET /api/settings` only ever returns masked key
  previews — raw keys travel from browser to server on save and are never
  echoed back.
