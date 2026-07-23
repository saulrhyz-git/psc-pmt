"use client";

/**
 * components/ProviderSelector.tsx
 * -----------------------------------------------------------------------------
 * Lets the user pick which AI vision backend analyzes their plan: Gemini
 * (free tier, recommended for students/no-budget use), Claude (paid,
 * typically stronger on messy hand sketches), or Kimi (paid, native vision,
 * very large context window). Purely a presentation + selection component —
 * it only imports the dependency-free metadata module
 * (lib/vision-provider-metadata.ts), never the SDK-backed lib/claude-vision.ts
 * or lib/gemini-vision.ts, so no server-only code leaks into the client bundle.
 * -----------------------------------------------------------------------------
 */

import { CheckCircle2, ExternalLink, Sparkles, Wallet } from "lucide-react";
import type { VisionProvider } from "@/lib/types";
import { VISION_PROVIDER_ORDER, VISION_PROVIDERS } from "@/lib/vision-provider-metadata";

interface ProviderSelectorProps {
  value: VisionProvider;
  onChange: (provider: VisionProvider) => void;
  disabled?: boolean;
}

export default function ProviderSelector({ value, onChange, disabled }: ProviderSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-slate-500">AI Provider</span>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {VISION_PROVIDER_ORDER.map((id) => {
          const info = VISION_PROVIDERS[id];
          const selected = value === id;
          const isFree = id === "gemini";
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(id)}
              aria-pressed={selected}
              className={[
                "flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                selected
                  ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">{info.label}</span>
                {selected && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}
              </div>

              <span
                className={[
                  "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  isFree ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                ].join(" ")}
              >
                {isFree ? <Sparkles className="h-3 w-3" /> : <Wallet className="h-3 w-3" />}
                {info.costNote}
              </span>

              <p className="text-[11px] leading-snug text-slate-500">{info.description}</p>

              <a
                href={info.getApiKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 flex w-fit items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
              >
                Get a {info.label} API key
                <ExternalLink className="h-3 w-3" />
              </a>
            </button>
          );
        })}
      </div>
    </div>
  );
}
