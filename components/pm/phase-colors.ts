/**
 * components/pm/phase-colors.ts
 * -----------------------------------------------------------------------------
 * Deterministic color assignment for construction phases (used by the Gantt
 * chart's bars/legend and the budget tracker's phase breakdown), so the same
 * phase name always renders the same color across views.
 *
 * Every Tailwind class below is a full literal string (never composed via
 * template interpolation) so Tailwind's JIT content scanner can find them —
 * this project has no safelist in tailwind.config.ts, so dynamically built
 * class names like `bg-${color}-500` would silently fail to render.
 * -----------------------------------------------------------------------------
 */

export interface PhaseColor {
  bar: string; // solid background, used for Gantt bars
  chip: string; // light background + text, used for legend/badges
  dot: string; // small solid dot, used in compact legends
}

const PHASE_PALETTE: PhaseColor[] = [
  { bar: "bg-indigo-500", chip: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500" },
  { bar: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  { bar: "bg-amber-500", chip: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  { bar: "bg-rose-500", chip: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  { bar: "bg-sky-500", chip: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  { bar: "bg-violet-500", chip: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  { bar: "bg-orange-500", chip: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  { bar: "bg-teal-500", chip: "bg-teal-100 text-teal-700", dot: "bg-teal-500" },
];

export function getPhaseColor(phase: string): PhaseColor {
  let hash = 0;
  for (let i = 0; i < phase.length; i++) {
    hash = (hash * 31 + phase.charCodeAt(i)) >>> 0;
  }
  return PHASE_PALETTE[hash % PHASE_PALETTE.length];
}
