/**
 * TanStack Query cache policy — Stale-While-Revalidate (SWR) tiers.
 *
 * Rules:
 * - `staleTime`: how long cached data is treated as fresh (no background refetch).
 * - `gcTime`: how long inactive cache survives after unmount (formerly cacheTime).
 * - Mutations still use existing `invalidateQueries` / optimistic updates — unchanged.
 * - Per-query overrides remain for safety-critical reads (see comments in consumers).
 *
 * Feature tiers (workspace-scoped, EN/AR share the same keys):
 *
 * | Tier              | Features                          | staleTime | Rationale |
 * |-------------------|-----------------------------------|-----------|-----------|
 * | workspaceMeta     | apps list, app limits, profile    | 2 min     | Rarely changes; SSR/hydration fills cache first |
 * | workspaceContext  | optimizer context, keyword signals| 45 sec    | Staging vault; invalidated on staging events |
 * | activeContext     | optimization queue, review queue| 45 sec    | Optimistic store is UI SSOT; query backs hydrate |
 * | reviewInsights    | review-derived curation gate        | 60 sec    | Expensive analysis; explicit invalidation on sync |
 * | staticAssets      | vault banners, signed URLs          | 5 min     | Low churn |
 */

/** Inactive cache retention — workspace session length. */
export const QUERY_GC_TIME = {
  /** Default for most workspace reads. */
  default: 30 * 60 * 1000,
  /** Short-lived optimistic / queue reads. */
  active: 15 * 60 * 1000,
  /** Longer retention for lists reused across routes (apps, profile). */
  workspace: 60 * 60 * 1000,
} as const;

export const QUERY_STALE = {
  /** Apps list, billing limits — sidebar + optimizer app picker. */
  workspaceMeta: 2 * 60 * 1000,
  /** Optimizer staging context + keyword signals vault branch. */
  workspaceContext: 45_000,
  /** Optimization queue + review active-context titles. */
  activeContext: 45_000,
  /** Review curation / derived insights gate. */
  reviewInsights: 60 * 1000,
  /** User profile (global, not workspace). */
  userProfile: 60 * 1000,
  /** Signed URLs / vault asset listings. */
  staticAssets: 5 * 60 * 1000,
} as const;

export type QueryCacheTier =
  | "workspaceMeta"
  | "workspaceContext"
  | "activeContext"
  | "reviewInsights"
  | "userProfile"
  | "staticAssets";

const STALE_BY_TIER: Record<QueryCacheTier, number> = {
  workspaceMeta: QUERY_STALE.workspaceMeta,
  workspaceContext: QUERY_STALE.workspaceContext,
  activeContext: QUERY_STALE.activeContext,
  reviewInsights: QUERY_STALE.reviewInsights,
  userProfile: QUERY_STALE.userProfile,
  staticAssets: QUERY_STALE.staticAssets,
};

const GC_BY_TIER: Record<QueryCacheTier, number> = {
  workspaceMeta: QUERY_GC_TIME.workspace,
  workspaceContext: QUERY_GC_TIME.default,
  activeContext: QUERY_GC_TIME.active,
  reviewInsights: QUERY_GC_TIME.default,
  userProfile: QUERY_GC_TIME.workspace,
  staticAssets: QUERY_GC_TIME.default,
};

export type QueryDefaultsOptions = {
  /**
   * When true, still refetch on every mount but show stale cache immediately (SWR).
   * Use for SSR-hydrated lists that must reconcile with the API in the background.
   */
  reconcileOnMount?: boolean;
};

/**
 * Standard query options for a feature tier.
 * Only adjusts cache timing — never queryKey or queryFn.
 */
export function queryDefaultsFor(
  tier: QueryCacheTier,
  options?: QueryDefaultsOptions,
): {
  staleTime: number;
  gcTime: number;
  refetchOnWindowFocus: false;
  refetchOnMount: "always";
  structuralSharing: true;
} {
  return {
    staleTime: STALE_BY_TIER[tier],
    gcTime: GC_BY_TIER[tier],
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    structuralSharing: true,
  };
}

/** Global QueryClient defaults — SWR baseline for every workspace route (EN/AR). */
export const GLOBAL_QUERY_DEFAULTS = {
  /** Cached data is fresh for 30s; after that, show cache + background revalidate. */
  staleTime: 30_000,
  /** Keep inactive cache for 30 minutes (session-length navigation). */
  gcTime: 30 * 60_000,
  /** Avoid surprise refetches when switching browser tabs. */
  refetchOnWindowFocus: false as const,
  /** Refresh stale data when the network comes back online. */
  refetchOnReconnect: true as const,
  /** Revalidate in background on mount; render cached data first. */
  refetchOnMount: "always" as const,
  retry: 2,
  networkMode: "online" as const,
  structuralSharing: true as const,
};
