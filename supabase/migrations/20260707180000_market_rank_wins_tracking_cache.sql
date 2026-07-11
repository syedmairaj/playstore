-- Add Live Rank Tracking payload to wins dashboard cache.

alter table market_rank_wins_cache
  add column if not exists tracking_json jsonb;
