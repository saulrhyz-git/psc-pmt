/**
 * lib/vision-provider-metadata.ts
 * -----------------------------------------------------------------------------
 * Static, dependency-free metadata about each supported vision provider
 * (label, description, free-tier note, where to get an API key). Deliberately
 * has zero imports from the Anthropic/Google SDKs so it's safe to import from
 * Client Components like components/ProviderSelector.tsx without bundling
 * server-only code into the browser. lib/vision-provider.ts (server-only)
 * re-exports this for convenience in API route error messages.
 * -----------------------------------------------------------------------------
 */

import type { VisionProvider, VisionProviderInfo } from "./types";

export const VISION_PROVIDERS: Record<VisionProvider, VisionProviderInfo> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    description: "Great default for students and no-budget use — Gemini's Flash tier is free with a personal API key.",
    costNote: "Free tier available",
    requiredEnvVar: "GEMINI_API_KEY",
    getApiKeyUrl: "https://aistudio.google.com/apikey",
  },
  claude: {
    id: "claude",
    label: "Anthropic Claude",
    description: "Anthropic's Claude 3.5 Sonnet. Typically stronger at reading messy hand sketches, but pay-as-you-go — no free tier.",
    costNote: "Paid API key required",
    requiredEnvVar: "ANTHROPIC_API_KEY",
    getApiKeyUrl: "https://console.anthropic.com/settings/keys",
  },
};

/** Ordered list for rendering (free/student-friendly option shown first). */
export const VISION_PROVIDER_ORDER: VisionProvider[] = ["gemini", "claude"];
