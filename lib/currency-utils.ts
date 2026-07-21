/**
 * lib/currency-utils.ts
 * -----------------------------------------------------------------------------
 * The app's default currency is the Philippine Peso. This is the single
 * shared formatter — every money display (Tool #1's material estimator, Tool
 * #2's KPIs/budget tracker/templates) should go through `formatCurrency`
 * rather than hand-rolling `$${n.toLocaleString()}` so the currency symbol
 * only needs to change in one place.
 *
 * Dependency-free (no fs/SDK imports), safe to import into Client Components.
 * -----------------------------------------------------------------------------
 */

export const CURRENCY_CODE = "PHP";
/** The Peso sign — used for compact inline labels (e.g. input placeholders) where a full Intl.NumberFormat call would be overkill. */
export const CURRENCY_SYMBOL = "₱"; // ₱

const formatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: CURRENCY_CODE,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const wholeFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: CURRENCY_CODE,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Formats a number as Philippine Peso, e.g. `formatCurrency(1234.5)` -> "₱1,234.50".
 * Pass `{ decimals: false }` for whole-peso display (e.g. large budget totals).
 */
export function formatCurrency(amount: number, options?: { decimals?: boolean }): string {
  if (!Number.isFinite(amount)) return formatter.format(0);
  return (options?.decimals === false ? wholeFormatter : formatter).format(amount);
}
