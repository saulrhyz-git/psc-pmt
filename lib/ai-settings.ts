/**
 * lib/ai-settings.ts
 * -----------------------------------------------------------------------------
 * In-app AI provider settings: API keys and model overrides that can be
 * configured from the app's Settings tab instead of editing `.env.local` by
 * hand and restarting the dev server.
 *
 * Storage: the singleton `AiSettings` row (id = 1) in Postgres — see
 * prisma/schema.prisma. This used to be a small gitignored JSON file
 * (`.ai-settings.local.json`); the precedence chain is unchanged: values
 * saved here take precedence over environment variables, so switching
 * keys/models from the UI takes effect immediately on the next request — no
 * restart required. If nothing has been saved via the UI, everything falls
 * back to the same environment variables (`GEMINI_API_KEY`,
 * `ANTHROPIC_API_KEY`, `GEMINI_VISION_MODEL`, `CLAUDE_VISION_MODEL`) used
 * before this feature existed, so existing `.env.local` setups keep working
 * unchanged.
 *
 * Server-only: this file uses the Prisma client (real TCP connections to
 * Postgres) and must never be imported from a Client Component.
 * lib/claude-vision.ts and lib/gemini-vision.ts (also server-only) are the
 * only intended callers, plus app/api/settings/route.ts.
 * -----------------------------------------------------------------------------
 */

import { prisma } from "./prisma";
import type { ProviderSettingsStatus, ResolvedSetting, StoredAiSettings } from "./types";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const DEFAULT_CLAUDE_MODEL = "claude-3-5-sonnet-20241022";

// -----------------------------------------------------------------------------
// Low-level read/write
// -----------------------------------------------------------------------------

/**
 * Reads the singleton settings row. A missing row is treated as "no settings
 * saved yet" — this store is a convenience layer, not a critical-path
 * dependency, so it should degrade gracefully to environment-variable-only
 * behavior rather than throwing.
 */
async function readStoredSettings(): Promise<StoredAiSettings> {
  const row = await prisma.aiSettings.findUnique({ where: { id: 1 } });
  if (!row) return {};
  const settings: StoredAiSettings = {};
  if (row.geminiApiKey) settings.geminiApiKey = row.geminiApiKey;
  if (row.geminiModel) settings.geminiModel = row.geminiModel;
  if (row.claudeApiKey) settings.claudeApiKey = row.claudeApiKey;
  if (row.claudeModel) settings.claudeModel = row.claudeModel;
  return settings;
}

/**
 * Merges a partial update into the stored settings and persists it.
 * Semantics per field:
 *   - key omitted from `update` entirely → leave the existing stored value untouched
 *   - key present with a non-empty string → overwrite
 *   - key present as an empty string `""` → explicitly clear (revert to env/default)
 */
export async function updateStoredSettings(update: Partial<StoredAiSettings>): Promise<StoredAiSettings> {
  const data: Record<string, string | null> = {};
  for (const key of Object.keys(update) as (keyof StoredAiSettings)[]) {
    const value = update[key];
    if (value === undefined) continue;
    data[key] = value === "" ? null : value;
  }

  const row = await prisma.aiSettings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });

  const next: StoredAiSettings = {};
  if (row.geminiApiKey) next.geminiApiKey = row.geminiApiKey;
  if (row.geminiModel) next.geminiModel = row.geminiModel;
  if (row.claudeApiKey) next.claudeApiKey = row.claudeApiKey;
  if (row.claudeModel) next.claudeModel = row.claudeModel;
  return next;
}

// -----------------------------------------------------------------------------
// Resolution logic (settings row → env var → built-in default), pure
// functions over an already-fetched StoredAiSettings so getAiSettingsStatus
// can resolve all four values from a single DB read instead of four.
// -----------------------------------------------------------------------------

function resolveGeminiApiKey(stored: StoredAiSettings): ResolvedSetting {
  if (stored.geminiApiKey) return { value: stored.geminiApiKey, source: "settings" };
  const envValue = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (envValue) return { value: envValue, source: "env" };
  return { value: undefined, source: "none" };
}

function resolveGeminiModel(stored: StoredAiSettings): ResolvedSetting {
  if (stored.geminiModel) return { value: stored.geminiModel, source: "settings" };
  if (process.env.GEMINI_VISION_MODEL) return { value: process.env.GEMINI_VISION_MODEL, source: "env" };
  return { value: DEFAULT_GEMINI_MODEL, source: "default" };
}

function resolveClaudeApiKey(stored: StoredAiSettings): ResolvedSetting {
  if (stored.claudeApiKey) return { value: stored.claudeApiKey, source: "settings" };
  const envValue = process.env.ANTHROPIC_API_KEY;
  if (envValue) return { value: envValue, source: "env" };
  return { value: undefined, source: "none" };
}

function resolveClaudeModel(stored: StoredAiSettings): ResolvedSetting {
  if (stored.claudeModel) return { value: stored.claudeModel, source: "settings" };
  if (process.env.CLAUDE_VISION_MODEL) return { value: process.env.CLAUDE_VISION_MODEL, source: "env" };
  return { value: DEFAULT_CLAUDE_MODEL, source: "default" };
}

export async function getGeminiApiKey(): Promise<ResolvedSetting> {
  return resolveGeminiApiKey(await readStoredSettings());
}

export async function getGeminiModel(): Promise<ResolvedSetting> {
  return resolveGeminiModel(await readStoredSettings());
}

export async function getClaudeApiKey(): Promise<ResolvedSetting> {
  return resolveClaudeApiKey(await readStoredSettings());
}

export async function getClaudeModel(): Promise<ResolvedSetting> {
  return resolveClaudeModel(await readStoredSettings());
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
export async function getAiSettingsStatus(): Promise<{ gemini: ProviderSettingsStatus; claude: ProviderSettingsStatus }> {
  const stored = await readStoredSettings();
  const geminiKey = resolveGeminiApiKey(stored);
  const geminiModel = resolveGeminiModel(stored);
  const claudeKey = resolveClaudeApiKey(stored);
  const claudeModel = resolveClaudeModel(stored);

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
