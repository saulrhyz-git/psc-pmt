/**
 * app/api/settings/route.ts
 * -----------------------------------------------------------------------------
 * GET  /api/settings  — returns a client-safe status snapshot (masked keys,
 *                        which model each provider will use, and whether each
 *                        value came from the in-app settings file, an env var,
 *                        or a built-in default).
 * POST /api/settings  — saves API keys / model overrides from the Settings
 *                        panel. Applies immediately (no server restart) since
 *                        lib/claude-vision.ts and lib/gemini-vision.ts resolve
 *                        settings fresh on every request.
 *
 * Raw API keys are NEVER included in a GET response — only a masked preview
 * (see lib/ai-settings.ts's maskSecret). The POST body is the only place raw
 * keys travel, and only from this browser to this same local server.
 * -----------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { getAiSettingsStatus, updateStoredSettings } from "@/lib/ai-settings";
import type { AiSettingsResponseBody, AiSettingsUpdateBody } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse<AiSettingsResponseBody>> {
  try {
    const status = getAiSettingsStatus();
    return NextResponse.json({ success: true, ...status }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/settings] GET failed:", err);
    return NextResponse.json(
      { success: false, error: "Failed to read current AI settings." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<AiSettingsResponseBody>> {
  let body: AiSettingsUpdateBody;

  try {
    body = (await req.json()) as AiSettingsUpdateBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validationError = validateBody(body);
  if (validationError) {
    return NextResponse.json({ success: false, error: validationError }, { status: 400 });
  }

  try {
    updateStoredSettings(body);
    const status = getAiSettingsStatus();
    return NextResponse.json({ success: true, ...status }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/settings] POST failed:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to save AI settings." },
      { status: 500 }
    );
  }
}

const ALLOWED_KEYS = new Set(["geminiApiKey", "geminiModel", "claudeApiKey", "claudeModel"]);

function validateBody(body: AiSettingsUpdateBody | undefined): string | null {
  if (!body || typeof body !== "object") return "Missing request body.";

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(key)) {
      return `Unknown settings field: "${key}".`;
    }
    if (value !== undefined && typeof value !== "string") {
      return `"${key}" must be a string (use an empty string "" to clear it).`;
    }
  }

  return null;
}
