import type { UxSentimentInsightSignal } from "@/lib/market/market-intel-signal-types";

export const MARKET_UX_INSIGHTS_UPDATED_EVENT = "market-ux-insights-updated";

const STORAGE_PREFIX = "playstore_market_ux_insights_";
const TTL_MS = 6 * 60 * 60 * 1000;

type StoredUxInsights = {
  insights: UxSentimentInsightSignal[];
  savedAt: number;
  category: string;
  country: string;
};

function storageKey(workspaceId: string): string {
  return `${STORAGE_PREFIX}${workspaceId}`;
}

export function persistMarketUxInsights(
  workspaceId: string,
  insights: UxSentimentInsightSignal[],
  meta: { category: string; country: string },
): void {
  if (typeof window === "undefined") return;
  try {
    const entry: StoredUxInsights = {
      insights,
      savedAt: Date.now(),
      category: meta.category,
      country: meta.country,
    };
    sessionStorage.setItem(storageKey(workspaceId), JSON.stringify(entry));
    window.dispatchEvent(
      new CustomEvent(MARKET_UX_INSIGHTS_UPDATED_EVENT, {
        detail: { workspaceId, count: insights.length },
      }),
    );
  } catch {
    /* quota — non-fatal */
  }
}

export function readMarketUxInsights(workspaceId: string): UxSentimentInsightSignal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(storageKey(workspaceId));
    if (!raw) return [];
    const entry = JSON.parse(raw) as StoredUxInsights;
    if (Date.now() - entry.savedAt > TTL_MS) {
      sessionStorage.removeItem(storageKey(workspaceId));
      return [];
    }
    return entry.insights ?? [];
  } catch {
    return [];
  }
}

export function readMarketUxInsightsMeta(
  workspaceId: string,
): Pick<StoredUxInsights, "category" | "country"> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(workspaceId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as StoredUxInsights;
    if (Date.now() - entry.savedAt > TTL_MS) return null;
    return { category: entry.category, country: entry.country };
  } catch {
    return null;
  }
}
