import type { FeatureFlagKey } from "./keys";

/** Safe defaults when DB is empty or unreachable (Phase 1 on, advanced off). */
export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagKey, boolean> = {
  keyword_tracker: true,
  listing_optimizer: true,
  workspace_dashboard: true,
  competitor_spy: true,
  review_insights: true,
  ranking_tracker_advanced: false,
  alerts_advanced: false,
  localization_playbook: false,
  market_intelligence: true,
};
