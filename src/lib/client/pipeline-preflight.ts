/**
 * Client-side helper for the pipeline pre-flight discovery check.
 *
 * Calls GET /api/listings/pipeline-status before the user initiates
 * generation.  Returns whether the pipeline is ready or blocked because an
 * intel module still has uncurated DISCOVERY signals.
 */

export type IntelModuleBlockReason =
  | "competitor_spy"
  | "review_analysis"
  | "market_intel";

export type PipelineDiscoveryBlocker = {
  module: IntelModuleBlockReason;
  discoveryCount: number;
  message: string;
};

export type PipelineReadinessResult =
  | { ready: true; visualWarnings?: unknown[] }
  | { ready: false; blockedBy: PipelineDiscoveryBlocker; visualWarnings?: unknown[] };

/**
 * Display names for each intel module, keyed by the backend source identifier.
 */
export const INTEL_MODULE_DISPLAY_NAMES: Record<IntelModuleBlockReason, string> = {
  competitor_spy: "Competitor Spy",
  review_analysis: "Review Insights",
  market_intel: "Market Intel",
};

/**
 * Deep-link paths for the curation view of each module.
 * Consumers should interpolate `/app/${workspaceId}` as a prefix.
 */
export const INTEL_MODULE_CURATION_PATHS: Record<IntelModuleBlockReason, string> = {
  competitor_spy: "/competitor-spy",
  review_analysis: "/reviews",
  market_intel: "/market-intelligence",
};

export async function checkPipelineReadiness(params: {
  workspaceId: string;
  appId?: string | null;
  queueHash?: string;
  vaultLocale?: "en" | "ar";
}): Promise<PipelineReadinessResult> {
  const { workspaceId, appId, queueHash, vaultLocale = "en" } = params;

  try {
    const urlParams = new URLSearchParams({ workspaceId, vaultLocale });
    if (appId) urlParams.set("appId", appId);
    if (queueHash) urlParams.set("queueHash", queueHash);

    const res = await fetch(`/api/listings/pipeline-status?${urlParams}`, {
      credentials: "include",
      headers: { "Cache-Control": "no-store" },
    });

    if (!res.ok) return { ready: true }; // fail open — never block on network error

    const json = (await res.json()) as {
      ok: boolean;
      ready: boolean;
      blockedBy?: PipelineDiscoveryBlocker;
      visualWarnings?: unknown[];
    };

    if (!json.ok) return { ready: true };

    if (!json.ready && json.blockedBy) {
      return {
        ready: false,
        blockedBy: json.blockedBy,
        visualWarnings: json.visualWarnings,
      };
    }

    return { ready: true, visualWarnings: json.visualWarnings };
  } catch {
    // Network failure — fail open, the generate route will re-check and return 423 if needed.
    return { ready: true };
  }
}
