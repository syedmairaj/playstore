export const FEATURE_FLAG_KEYS = [
  "keyword_tracker",
  "listing_optimizer",
  "workspace_dashboard",
  "competitor_spy",
  "review_insights",
  "ranking_tracker_advanced",
  "alerts_advanced",
  "localization_playbook",
  "market_intelligence",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];
