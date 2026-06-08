/**
 * Canonical USD pricing and overage packs for marketing + in-app pricing UI.
 * Import from here or re-export via `@/lib/pricing-plans` (avoid duplicating numbers).
 */
export const PRICING = {
  free: { monthly: 0, yearly: 0 },
  pro: { monthly: 29, yearly: 290 },
  growth: { monthly: 49, yearly: 470 },
  overagePackCredits: 100,
  overagePackUsd: 12,
} as const;

/** Annual vs monthly×12 discount fraction (marketing badge ~20%). */
export const PRICING_MODAL_ANNUAL_DISCOUNT = 0.2 as const;

/** Rounded percent saved vs paying monthly × 12 (pricing cards / badges). */
export function pricingSavingsPercentVsMonthly12(monthly: number, yearly: number): number {
  const full = monthly * 12;
  if (full <= 0) return 0;
  return Math.max(0, Math.round((1 - yearly / full) * 100));
}

/** Equivalent monthly when paying yearly (two decimal USD string). */
export function pricingEquivalentMonthlyFromYearly(yearly: number): string {
  return (yearly / 12).toFixed(2);
}
