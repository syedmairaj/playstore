"use client";

import type {
  MarketCaptureReport,
  MarketCaptureStagedChange,
  StagedChangeStatus,
} from "@/lib/market-capture/market-capture.types";

export type RequestMarketCaptureInput = {
  workspaceId: string;
  competitorName: string;
  locale: "en" | "ar";
  appName: string;
  category: string;
  appFeatures: string;
  queueItems?: unknown[];
  seedKeywords?: string[];
  currentListing?: {
    title?: string;
    shortDescription?: string;
    fullDescription?: string;
  };
};

export type MarketCaptureApiSuccess = {
  ok: true;
  data: MarketCaptureReport;
  meta?: { creditsRemaining?: number; creditsCharged?: number };
};

export type MarketCaptureApiFailure = {
  ok: false;
  error: { code: string; message: string };
};

export async function requestMarketCaptureProposals(
  input: RequestMarketCaptureInput,
): Promise<MarketCaptureApiSuccess | MarketCaptureApiFailure> {
  const res = await fetch("/api/listings/market-capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await res.json()) as MarketCaptureApiSuccess | MarketCaptureApiFailure;
}

export function patchStagedChangeStatus(
  report: MarketCaptureReport,
  changeId: string,
  status: StagedChangeStatus,
): MarketCaptureReport {
  return {
    ...report,
    stagedChanges: report.stagedChanges.map((c) =>
      c.id === changeId ? { ...c, status } : c,
    ),
  };
}

export function countStagedByStatus(
  changes: MarketCaptureStagedChange[],
  status: StagedChangeStatus,
): number {
  return changes.filter((c) => c.status === status).length;
}
