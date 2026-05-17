import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";

/**
 * AI credits for Serper-backed Play Store queries: one unit per country/market
 * (`serper_preview_per_country` in `credit-costs.ts`). Used by Keyword Tracker
 * live preview and per-keyword refresh so debit math stays in one place.
 */
export function serperAiCreditsForCountryCount(countryCount: number): number {
  const n = Math.max(0, Math.floor(Number(countryCount)));
  return n * AI_CREDIT_COSTS.serper_preview_per_country;
}

/**
 * Competitor Spy live preview bundle: **5** credits cover up to **2** markets,
 * then **+2** credits per additional market (3→7, 4→9, …).
 */
export function competitorSpyAiCreditsForCountryCount(countryCount: number): number {
  const n = Math.max(0, Math.floor(Number(countryCount)));
  if (n === 0) return 0;
  return 5 + 2 * Math.max(0, n - 2);
}
