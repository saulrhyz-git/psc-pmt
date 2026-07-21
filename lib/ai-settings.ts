/**
 * lib/ai-settings.ts
 * -----------------------------------------------------------------------------
 * In-app AI provider settings: API keys and model overrides that can be
 * configured from the app's Settings panel instead of editing `.env.local` by
 * hand and restarting the dev server.
 *
 * Storage: a small JSON file at the project root (AI_SETTINGS_FILE, gitignored
 * — see .gitignore). This is intentionally simple (no database) since the
 * primary use case is a single local install (e.g. a student running
 * `npm run dev` on their own machine). Values saved here take precedence over
 * environment variables, so switching keys/models from the UI takes effect
 * immediately on the next request — no restart required. If nothing has been
 * saved via the UI, everything falls back to the same environment variables
 * (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_VISION_MODEL`,
 * `CLAUDE_VISION_MODEL`) used before this feature existed, so existing
 * `.env.local` setups keep working unchanged.
 *
 * Server-only: this file uses Node's `fs` module and must never be imported
 * from a Client Component. lib/claude-vision.ts and lib/gemini-vision.ts
 * (also server-only) are the only intended callers, plus app/api/settings/route.ts.
 * -----------------------------------------------------------------------------
 */

import fs from "node:fs";
import path from "node:path";
import type { ProviderSettingsStatus, ResolvedSetting, StoredAiSettings } from "./types";

const SETTINGS_FILE = path.join(process.cwd(), ".ai-settings.local.json");

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const DEFAULT_CLAUDE_MODEL = "claude-3-5-sonnet-20241022";

// -----------------------------------------------------------------------------
// Low-level file I/O
// -----------------------------------------------------------------------------

/**
 * Reads the settings file. Missing file, unreadable file, or malformed JSON
 * are all treated as "no settings saved yet" rather than thrown errors — this
 * store is a convenience layer, not a critical-path dependency, so it should
 * degrade gracefully to environment-variable-only behavior.
 */
function readStoredSettings(): StoredAiSettings {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as StoredAiSettings;
  } catch {
    return {};
  }
}

/**
 * Writes the settings file. Throws a descriptive error on failure (e.g. a
 * read-only filesystem in some hosted environments) so the API route can
 * surface it clearly instead of silently no-oping.
 */
function writeStoredSettings(settings: StoredAiSettings): void {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
  } catch (err) {
    throw new Error(
      `Could not write ${path.basename(SETTINGS_FILE)}: ${err instanceof Error ? err.message : String(err)}. ` +
        `This environment's filesystem may be read-only (common on some hosted deployments) — use environment variables instead.`
    );
  }
}

/**
 * Merges a partial update into the stored settings and persists it.
 * Semantics per field:
 *   - key omitted from `update` entirely → leave the existing stored value untouched
 *   - key present with a non-empty string → overwrite
 *   - key present as an empty string `""` → explicitly clear (revert to env/default)
 */
export function updateStoredSettings(update: Partial<StoredAiSettings>): StoredAiSettings {
  const current = readStoredSettings();
  const next: StoredAiSettings = { ...current };

  for (const key of Object.keys(update) as (keyof StoredAiSettings)[]) {
    const value = update[key];
    if (value === undefined) continue;
    if (value === "") {
      delete next[key];
    } else {
      next[key] = value;
    }
  }

  writeStoredSettings(next);
  return next;
}

// -----------------------------------------------------------------------------
// Resolved getters (settings file → env var → built-in default)
// -----------------------------------------------------------------------------

export function getGeminiApiKey(): ResolvedSetting {
  const stored = readStoredSettings();
  if (stored.geminiApiKey) return { value: stored.geminiApiKey, source: "settings" };
  const envValue = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (envValue) return { value: envValue, source: "env" };
  return { value: undefined, source: "none" };
}

export function getGeminiModel(): ResolvedSetting {
  const stored = readStoredSettings();
  if (stored.geminiModel) return { value: stored.geminiModel, source: "settings" };
  if (process.env.GEMINI_VISION_MODEL) return { value: process.env.GEMINI_VISION_MODEL, source: "env" };
  return { value: DEFAULT_GEMINI_MODEL, source: "default" };
}

export function getClaudeApiKey(): ResolvedSetting {
  const stored = readStoredSettings();
  if (stored.claudeApiKey) return { value: stored.claudeApiKey, source: "settings" };
  const envValue = process.env.ANTHROPIC_API_KEY;
  if (envValue) return { value: envValue, source: "env" };
  return { value: undefined, source: "none" };
}

export function getClaudeModel(): ResolvedSetting {
  const stored = readStoredSettings();
  if (stored.claudeModel) return { value: stored.claudeModel, source: "settings" };
  if (process.env.CLAUDE_VISION_MODEL) return { value: process.env.CLAUDE_VISION_MODEL, source: "env" };
  return { value: DEFAULT_CLAUDE_MODEL, source: "default" };
}

// -----------------------------------------------------------------------------
// Client-safe status snapshot (never includes raw secret values)
// -----------------------------------------------------------------------------

/** Masks a secret for display: keeps a few leading/trailing characters, dots the middle. */
function maskSecret(secret: string): string {
  if (secret.length <= 10) return "•".repeat(secret.length);
  return `${secret.slice(0, 6)}${"•".repeat(8)}${secret.slice(-4)}`;
}

/** Builds the full status snapshot returned by GET /api/settings — safe to send to the client. */
export function getAiSettingsStatus(): { gemini: ProviderSettingsStatus; claude: ProviderSettingsStatus } {
  const geminiKey = getGeminiApiKey();
  const geminiModel = getGeminiModel();
  const claudeKey = getClaudeApiKey();
  const claudeModel = getClaudeModel();

  return {
    gemini: {
      configured: !!geminiKey.value,
      keySource: geminiKey.source,
      maskedKey: geminiKey.value ? maskSecret(geminiKey.value) : undefined,
      model: geminiModel.value ?? DEFAULT_GEMINI_MODEL,
      modelSource: geminiModel.source,
    },
    claude: {
      configured: !!claudeKey.value,
      keySource: claudeKey.source,
      maskedKey: claudeKey.value ? maskSecret(claudeKey.value) : undefined,
      model: claudeModel.value ?? DEFAULT_CLAUDE_MODEL,
      modelSource: claudeModel.source,
    },
  };
}

export { DEFAULT_GEMINI_MODEL, DEFAULT_CLAUDE_MODEL };
