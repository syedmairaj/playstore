"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MARKET_UX_INSIGHTS_UPDATED_EVENT,
  readMarketUxInsights,
  readMarketUxInsightsMeta,
} from "@/lib/client/market-ux-insights-store";
import type { UxSentimentInsightSignal } from "@/lib/market/market-intel-signal-types";

export function useMarketUxSentimentInsights(workspaceId: string): {
  insights: UxSentimentInsightSignal[];
  meta: { category: string; country: string } | null;
  refresh: () => void;
} {
  const [insights, setInsights] = useState<UxSentimentInsightSignal[]>([]);
  const [meta, setMeta] = useState<{ category: string; country: string } | null>(null);

  const refresh = useCallback(() => {
    setInsights(readMarketUxInsights(workspaceId));
    setMeta(readMarketUxInsightsMeta(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId: string }>).detail;
      if (detail?.workspaceId === workspaceId) refresh();
    };
    window.addEventListener(MARKET_UX_INSIGHTS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(MARKET_UX_INSIGHTS_UPDATED_EVENT, handler);
  }, [workspaceId, refresh]);

  return { insights, meta, refresh };
}
