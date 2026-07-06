# Database

## Main Tables
- users
- workspaces
- apps
- keywords
- keyword_rank_snapshots
- competitors
- reviews
- listings
- localization_suggestions
- alerts
- scores
- notes

## Phase 1 MVP additions (live schema)

These support the AI App Listing Optimizer and operational controls:

- **listing_generations** — Inputs (app name, category, keywords array `target_keywords`, features `app_features`, tone) plus optional **`output_json`** (full Gemini listing JSON: title, shortDescription, fullDescription, keywordSuggestions, ctaSuggestions, and optional **Certified ASO Score** fields `asoScore`, `scoreBreakdown`, `improvementTips`, or `asoScoreDegraded` when scoring failed validation; **nullable** for AI-autofill-only input snapshots before a full listing run), `model`, `prompt_version`, `client_ip`, `created_at`, **`updated_at`** (auto-refreshed on every write via `trg_listing_generations_updated_at`). **Session upsert:** one canonical row per `(workspace_id, user_id, app_id)` — or `(workspace_id, user_id)` when `app_id` is null — via partial unique indexes; finalize/full generation **upserts** instead of always inserting.
- **usage_logs** — Per-request logging: `route`, `client_ip`, `success`, `duration_ms`, optional `error_message`, optional `meta` JSON.
- **rate_limit_buckets** — Composite key `(key, window_start)` with `count` for fixed-window rate limiting.
- **public.consume_rate_limit(p_key text, p_max int)** — `SECURITY DEFINER` RPC; returns JSON `{ allowed, count }`. Executable by `service_role` only (see migration).

### Workspace AI credits (wallet + ledger)

- **`credits_ledger`** — Append-only movements; negative `amount` = spend, positive = refund or top-up.
- **`consume_workspace_ai_credits(p_workspace_id, p_user_id, p_amount, p_description, p_source_type, p_meta)`** — `SECURITY DEFINER`; verifies member + caller, locks the workspace row (`FOR UPDATE`), returns `insufficient_credits` if `ai_credits_remaining < p_amount`, otherwise debits and inserts a spend row. Granted to `authenticated` and `service_role`.
- **`consume_modular_listing_regenerate(p_workspace_id, p_user_id, p_generation_step, p_meta)`** — `SECURITY DEFINER`; locks workspace, increments `trial_regenerations_used` when `< 3` (free trial slot), otherwise debits **1** credit and inserts a **`credits_ledger`** row with `meta.generation_type = 'text'`. Client cannot set the trial counter directly.
- **`refund_workspace_ai_credits(p_ledger_id, p_user_id, p_reason)`** — Reverses a prior spend (idempotent when already refunded). Granted to `authenticated` and `service_role`.

**Ledger `meta.generation_type`:** spend rows should include `text` (listing copy, modular regenerate after trial) or `media` (Creative Bundle / banner batch, **30** credits). Set via `buildCreditLedgerMeta()` in API routes.

**Admin (site operators)** — **`admin_financial_snapshot(p_series_from date, p_series_to date)`** — `SECURITY DEFINER`; callable when **`profiles.is_admin`** is true **or** **`profiles.role = 'admin'`** for **`auth.uid()`** (no matching row → not admin). Returns JSON `{ ok, code }` on failure (e.g. `forbidden`) or aggregates on success. Migrations: `supabase/migrations/20260513120000_profiles_is_admin_admin_financial_rpc.sql`, then `supabase/migrations/20260513130000_profiles_role_site_admin.sql`. Setup and troubleshooting: [`docs/admin-financial-setup.md`](./admin-financial-setup.md).

**Admin AI COGS (token-level):** **`admin_ai_transaction_logs`** — one row per Gemini-backed AI call for admin margin analytics.

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid FK → `auth.users` | Caller |
| `workspace_id` | uuid FK → `workspaces`, nullable | Set when the feature is workspace-scoped |
| `feature_slug` | text | e.g. `localization`, `reviews_ai_reply`, `serper_competitor_spy` |
| `provider_service` | text | `gemini` \| `serper` |
| `prompt_tokens` | integer ≥ 0 | Legacy Gemini input (mirrors `input_tokens` on insert) |
| `completion_tokens` | integer ≥ 0 | Legacy Gemini output (mirrors `output_tokens`) |
| `input_tokens` | integer ≥ 0 | Prompt tokens (Gemini) or Serper query count |
| `output_tokens` | integer ≥ 0 | Completion tokens (Gemini); `0` for Serper |
| `total_tokens` | integer, nullable | Optional total from provider metadata |
| `input_cost_usd` | numeric(12,6) | Input / Serper query USD fraction |
| `output_cost_usd` | numeric(12,6) | Output USD fraction (Gemini only) |
| `raw_cogs_usd` | numeric(12,6) | Total provider COGS (`input_cost_usd + output_cost_usd`) |
| `raw_usd_cost` | numeric(12,6) | Kept in sync with `raw_cogs_usd` for older readers |
| `credits_charged` | integer ≥ 0 | Workspace credits debited for the call |
| `created_at` | timestamptz | Insert time |

**Pricing (computed in `lib/admin/log-ai-transaction.ts` before insert):** Gemini **2.5 Flash** — input `$0.075`/1M tokens, output `$0.30`/1M (`lib/gemini/pricing.ts`). Serper — `$0.001` per query (country search). Inserts from localize, review reply/draft, Serper preview, keyword refresh, Competitor Spy.

RLS: **admin read only** (`profiles.is_admin` or `profiles.role = 'admin'`); inserts via **service role** from API routes (`lib/admin/log-ai-transaction.ts`). Aggregates: `lib/admin/ai-analytics.ts` (feature leaderboard, plan margin checker).

Migrations: `20260519140000_admin_ai_transaction_logs.sql` (initial DDL); `20260519160000_admin_ai_transaction_logs_align_columns.sql` (backfill legacy columns); `20260519170000_admin_ai_transaction_logs_cogs_breakdown.sql` (provider + cost fractions).

Profile moderation: **`profiles.account_status`** (`active` \| `flagged` \| `suspended`); migration `20260519150000_profiles_account_status.sql`.

Migration: `supabase/migrations/20250516000000_credits_ledger_wallet.sql`. See also `docs/architecture.md` and `docs/api.md`.

## Phase 2 additions (auth, workspaces, keywords)

- **profiles** — `id` → `auth.users`, `display_name`, `onboarding_completed_at`, optional **`is_admin`** (boolean, default false), optional **`role`** (e.g. `'admin'` for site operators; same effect as `is_admin` for `/admin/*` and `admin_financial_snapshot`). Optional **`account_status`** (`active` \| `flagged` \| `suspended`, default `active`) — suspended blocks API (`403`) and `/app` routes. RLS: self read/update; **peer read** for users who share a workspace (roster).
- **workspaces** — `name`, **`owner_id`** (uuid, not null, FK → `auth.users`, canonical owner), **`created_by`** (uuid, not null, FK → `auth.users`; must equal `owner_id`). A **before insert/update** trigger (`workspaces_owner_columns_sync`) mirrors the two when only one is supplied and rejects conflicting values. Timestamps. RLS: members read; authenticated inserts require **`created_by = auth.uid()` and `owner_id = auth.uid()`**; owners/admins update name.
- **workspace_members** — Composite PK `(workspace_id, user_id)`, `role` in (`owner`,`admin`,`member`). Owner row is created by the `on_workspace_created` trigger (`handle_new_workspace`, uses `coalesce(owner_id, created_by)`) and is also inserted defensively by **`public.create_new_workspace(text)`** with `ON CONFLICT DO NOTHING`. RLS: roster visible to members.
- **apps** — `workspace_id`, `name`, optional `package_name`, optional **`canonical_package_id`** (manual production Play Store id for Serper lookups), optional **`serp_matched_package_id`** (learned from successful title match on refresh), optional **`icon_url`** (text, HTTPS app listing icon; preferred over duplicate in metadata when present), optional `metadata` (jsonb, default `{}`) for ASO extras (`category`, `short_description`, `icon_url` mirror for older clients). **Listing Optimizer logo generator (MVP):** optional nested **`metadata.logoGenerator`** — `{ generatedUrls: string[] (≤4, HTTPS), selectedUrl: string | null, updatedAt: string (ISO) }` for reopening the dialog and phone preview before/without applying `icon_url`. Default app created with first workspace. RLS: member CRUD (delete limited to owner/admin per policy).
- **keywords** — `workspace_id`, optional **`app_id`** (nullable for workspace-wide tracking), `term`, optional generated **`keyword`** (trimmed term), `market`, `locale`, optional `notes`, optional **`source`** (e.g. `ai_listing`), optional **`listing_generation_id`** (FK → `listing_generations`, nullable), **`best_rank`** (rolling best / lowest rank), **`updated_at`**. **ASO ROI (MVP):** optional **`aso_baseline_rank`**, **`aso_baseline_captured_at`**, **`aso_baseline_source`** (`initial_save` \| `manual`), **`last_listing_optimization_at`**, **`last_listing_optimization_generation_id`** (FK → `listing_generations`), **`rank_at_last_listing_optimization`**, **`recent_rank_gain`**, **`recent_rank_gain_at`** (7‑day badge window). Unique tracked term per workspace/app/market via partial unique indexes (`keywords_unique_term_with_app`, `keywords_unique_term_workspace_only`).
- **keyword_rank_snapshots** — `keyword_id`, **`rank`**, **`best_rank`** (running minimum per snapshot row), optional **`search_volume`**, optional **`country_code`** (lowercase alpha-2 Play market for Serper-tagged rows; null on legacy/manual), **`snapshot_at`**, **`source`** (`manual`, `demo`, `serper`, etc.). Replaces legacy `keyword_ranks`; indexed by `(keyword_id, snapshot_at)`. RLS mirrors keyword membership (insert `with check` on `keyword_id` only; **`country_code`** is not part of policy predicates). Workspace list **`latest`** rank prefers the row for **`keywords.market`** when several countries share the same **`snapshot_at`**.
- **keyword_rank_history** (view) — Flattened snapshots joined to `keywords` (`workspace_id`, `keyword`, ranks, `snapshot_date`) for analytics and exports.

Migration: `supabase/migrations/20260514120000_keyword_rank_snapshots.sql` (supersedes `keyword_ranks` from Phase 2 DDL after migrate). Optional column **`country_code`**: `supabase/migrations/20260514140000_keyword_rank_snapshots_country_code.sql`. ASO baseline + listing↔keyword links + `aso_rank_improvement` alerts: `supabase/migrations/20260515160000_keyword_aso_baseline_listing_links_alerts.sql`. **Keyword Tracker Serper preview draft (per user):** table **`workspace_keyword_serper_preview_drafts`** (`workspace_id`, `user_id`, `payload` jsonb, `updated_at`) — RLS: members read/write **own** `(workspace_id, user_id)` row only; API `GET`/`PUT`/`DELETE` `/api/workspaces/:id/keywords/serper-preview-draft`. Migration: `supabase/migrations/20260515170000_workspace_keyword_serper_preview_draft.sql`. **Competitor Spy analyses (per workspace):** table **`workspace_competitor_analyses`** — `workspace_id`, `competitor_package_id` (unique per workspace), `competitor_name`, optional `category`, optional `icon_url`, **`analysis_json`** (gaps, shared keywords, quick wins, optional Serper `previewResults`), `countries` (text[]), `analyzed_at`, `created_by`; RLS: **workspace members** CRUD; API `GET`/`POST` `/api/workspaces/:id/competitors`. Migration: `supabase/migrations/20260516100000_workspace_competitor_analyses.sql`. **Listing Optimizer review queue (per workspace):** table **`workspace_listing_improvements`** — `workspace_id`, `user_id`, optional `app_id` FK → `apps`, optional `package_name`, `review_id` (unique with `workspace_id`), `review_text`, `user_name`, `score` (1–5), `sentiment_tag` (default `Competitor Weakness`), `is_utilized` (default false), `created_at`; RLS: **workspace members** CRUD; API `GET`/`POST` `/api/workspaces/:id/listing-improvements`. Migration: `supabase/migrations/20260519120000_workspace_listing_improvements.sql`. **Listing localization (per workspace app + market):** table **`workspace_localized_listings`** — `workspace_id`, `app_id` FK → `apps`, `market` (`ae` \| `in` \| `mx`), `title`, `short_description`, `long_description`, `keywords` (jsonb array), `updated_at`; unique `(workspace_id, app_id, market)`; RLS: **workspace members** CRUD; API `GET`/`POST` `/api/workspaces/:id/listings/localize`. Migration: `supabase/migrations/20260519130000_workspace_localized_listings.sql`.
- **workspace_localized_listings** — `workspace_id`, `app_id`, `market` (`ae` \| `in` \| `mx`), `title`, `short_description`, `long_description`, `keywords` (jsonb), `updated_at`; unique per `(workspace_id, app_id, market)`; RLS: workspace members CRUD; API `GET`/`POST` `/api/workspaces/:id/listings/localize`. Migration: `supabase/migrations/20260519130000_workspace_localized_listings.sql`.
- **workspace_listing_drafts** — Modular optimizer drafts keyed by **`queue_hash`** (active optimization vault hash). Columns: `workspace_id`, `user_id`, optional `app_id`, `vault_locale` (`en` \| `ar`), `title`, `short_description` (jsonb), `long_description` (jsonb), `modular_listing` (jsonb), **`job_id`**, **`generation_status`** (`pending` \| `processing` \| `completed` \| `failed`), **`current_phase`**, **`generation_error`**, **`generation_payload`**, **`generation_result`**, `created_at`, **`updated_at`** (auto via `trg_workspace_listing_drafts_updated_at`). Unique `(workspace_id, queue_hash)`; upserted on each generate step. Rehydrate: `GET /api/listings/draft?workspaceId=&queueHash=`. Migrations: `supabase/migrations/20260621130000_workspace_listing_drafts.sql`, `supabase/migrations/20260622180000_listing_generation_job_status.sql`.
- **listing_generation_costs** — Per-phase listing optimizer telemetry: `workspace_id`, `queue_hash`, `phase` (`title` \| `short` \| `long` \| `full`), `tokens_used`, `credit_cost`, `created_at`. Written server-side after each Gemini phase; aggregated by `GET /api/billing/usage-breakdown`. Migration: `supabase/migrations/20260622160000_add_listing_generation_costs.sql`.
- **listing_performance** — Day-level Play Store funnel metrics linked to a `listing_versions` row. Columns: `id` (PK), `version_id` FK → `listing_versions` (CASCADE DELETE), `workspace_id` FK (denormalised for RLS + analytics), `vault_locale` (`en` \| `ar`), `performance_date` (date), `impressions` (bigint), `store_visitors` (bigint), `store_listing_page_views` (bigint), `installers` (bigint), `conversion_rate` (numeric 10,4 — `installers / store_visitors × 100`), `signal_context_snapshot` (nullable jsonb — verbatim `GenerationSignalContext` captured at generation time for correlation queries), `data_source` (`play_store_api` \| `gcs_export` \| `manual`), `created_at`, `updated_at` (auto via trigger). Unique `(version_id, performance_date, vault_locale)`. Indexes: `(version_id, performance_date DESC)`, `(workspace_id, performance_date DESC)`, `(workspace_id, vault_locale, performance_date DESC)`, GIN on `signal_context_snapshot` (partial, non-null rows only). RLS: members SELECT/INSERT/UPDATE; owner/admin DELETE; service_role unrestricted. DB function: **`get_latest_performance_summary(p_version_id uuid)`** returns `(avg_conversion_rate, total_impressions, total_store_visitors, total_installers, days_with_data, first_date, latest_date)` — `STABLE SECURITY DEFINER`, granted to `authenticated` + `service_role`. Migration: `supabase/migrations/20260627210000_listing_performance.sql`.
- **listing_version_signal_snapshots** — Captures the `GenerationSignalContext` at the moment a listing generation job ran. Columns: `id` (PK), `version_id` (nullable FK → `listing_versions`), `job_id` (unique — primary correlation key), `workspace_id` FK, `vault_locale` (`en` \| `ar`), five JSONB signal columns (`brand_kit`, `market_intel`, `reviews`, `keyword_tracker`, `competitor_signals`), pre-computed counts (`signal_count`, `keywords_count`, `competitors_count`, `review_pains_count`, `market_gaps_count`, `has_brand_kit`). Upserted on `job_id` conflict. Linked to a `listing_versions` row after creation via `linkSnapshotToVersion()`. Migration: `supabase/migrations/20260628100000_performance_attribution.sql`.
- **listing_version_metrics** — Daily Play Store funnel metrics per listing version. Columns: `id` (PK), `version_id` FK, `workspace_id` FK, optional `app_id` FK, `package_name`, `vault_locale`, `metric_date` (date), `store_visits`, `installers`, `impressions`, `conversion_rate`, `store_listing_cvr`, `ctr` (all nullable), `source` (`play_store_api` \| `gcs_export` \| `manual`). Unique `(version_id, metric_date, vault_locale)`. Data fetched from the Google Play GCS acquisition CSV (`gs://pubsite_prod_rev_{account}/stats/acquisitions/`) and cached here. APIs: `GET`/`PATCH` `/api/workspaces/:id/performance-attribution`. Migration: `supabase/migrations/20260628100000_performance_attribution.sql`.
- **listing_versions** — Stateful version history for listing copy. Columns: `id` (PK), `workspace_id` FK, optional `app_id` FK, `vault_locale` (`en` \| `ar`), `version_number` (auto-sequenced per workspace/app/locale via `next_listing_version_number()`), `status` (`draft` \| `published` \| `deployed`), `title`, `short_description`, `long_description`, `keyword_suggestions` (jsonb `[]`), `cta_suggestions` (jsonb `[]`), `screenshot_captions` (jsonb `[{order, caption, theme}]`), `live_listing_snapshot` (nullable jsonb for Deployment View), `source_queue_hash`, `source_job_id` (links to `workspace_listing_drafts.job_id`), `source_generation_id`, `published_at`, `deployed_at`, `notes`, `created_by`, `created_at`, `updated_at` (auto via trigger). RLS: members SELECT/INSERT/UPDATE; owner/admin DELETE. Created by the produce route before 202 (placeholder) and back-filled by the worker on job completion. APIs: `GET`/`POST` `/api/workspaces/:id/listing-versions` and `GET`/`PATCH` `/api/workspaces/:id/listing-versions/:versionId`. Migration: `supabase/migrations/20260627100000_listing_versions.sql`.
- **Context Gateway (Phase 1)** — Normalized ASO signal tables used by `compileContext()` before listing generation (EN/AR via `locale`):
  - **`workspace_keywords`** — staged Keyword Tracker terms (`is_staged = true`, optional `queue_hash`). On `POST /api/listings/generate`, **`syncQueueHash`** sets `queue_hash` for staged rows matching `workspace_id`, `app_id`, and `vault_locale` immediately before context compile. Index: **`workspace_keywords_queue_hash_idx`** on `queue_hash` (`20260622150000_add_queue_hash_index.sql`).
  - **`workspace_market_snapshots`** — market rank / volume snapshots per keyword
  - **`workspace_reviews`** — review snippets with AI tags (`sentiment_tag`, `ai_tags[]`)
  Migration backfills from `keywords`, `keyword_rank_snapshots`, and `workspace_listing_improvements`. See `supabase/migrations/20260621140000_workspace_context_gateway_tables.sql` and `src/lib/listing/context-gateway.ts`.
- **workspace_alerts** — `workspace_id`, optional `keyword_id`, `type` (`rank_drop` | `rank_threshold` | **`aso_rank_improvement`**), copy fields, `read_at`, `meta` JSON.
- **listing_generations (Phase 2 columns)** — `workspace_id` FK, `user_id` FK, optional **`app_id`** FK → `apps` (scopes a run to a workspace app for Keyword Tracker); RLS policies for `authenticated` require membership + `user_id = auth.uid()` on insert.
- **`listing_generation_keywords`** — Links a **`listing_generations`** row to tracked **`keywords`** for the same workspace at generation time (many-to-many); used with keyword refresh to attribute **≥5 position** organic gains to the latest linked optimization and to insert **`aso_rank_improvement`** alerts.

Helpers: **`public.is_workspace_member(uuid)`**, **`public.workspace_role(uuid)`** (both `SECURITY DEFINER`, granted to `authenticated`).

**`public.create_new_workspace(p_name text) → uuid`** — `SECURITY DEFINER`, `search_path = pg_catalog, public`. Callable by `authenticated` and `service_role`. Reads the caller with `(select auth.uid())`; if null, raises a clear exception. Trims `p_name` and requires length ≥ 2. Inserts `workspaces` with **`created_by` and `owner_id` both set to `auth.uid()`**, then inserts **`workspace_members`** with **`role = 'owner'`** and `ON CONFLICT (workspace_id, user_id) DO NOTHING`, then seeds the default app and a sample `listing_generations` row. Returns the new workspace `id`. App entrypoint: `POST` `/api/workspaces` via `supabase.rpc('create_new_workspace', { p_name })`. Migration: `supabase/migrations/20250521000000_workspaces_owner_id_and_create_new_workspace.sql` (adds `owner_id`, sync trigger, RLS tweak, and replaces the function; supersedes `20250520000000_*` and earlier RPC migrations).

Full DDL + policies: `supabase/migrations/20250512000000_phase2_auth_workspaces_keywords.sql`. Narrative: `docs/phase2-auth-workspaces-keywords.md`.

## Core pages extensions

- **`workspaces.plan`** — `starter` \| `pro` \| `agency` (text, default starter).
- **`workspaces.trial_regenerations_used`** — integer (default 0); workspace-scoped count of modular listing **Regenerate** clicks consumed from the trial quota (first **3** free per workspace; further regenerates debit **1** text credit via RPC `consume_modular_listing_regenerate`). Migration: `supabase/migrations/20260618120000_workspace_trial_regenerations.sql`.
- **`workspaces.monthly_credit_cap`** — optional integer; user-defined monthly credit spend limit. When usage exceeds **80%**, a `credit_budget_warning` workspace alert is created (deduped per billing month). Migration: `supabase/migrations/20260622170000_workspace_monthly_credit_cap.sql`.
- **`workspaces.onboarding_state`** — jsonb for guided onboarding progress (`completed`, `step`, etc.).
- **`apps.play_store_url`**, **`apps.target_countries`**, **`apps.icon_url`**, **`apps.metadata`** — optional Play listing context; `metadata` holds ASO fields not modeled as top-level columns (e.g. category, short description, icon URL mirror).
- **`workspace_invitations`** — pending invites (`email`, `role` admin|member, `invited_by`); unique per workspace + lower(email). RLS: members read; owner/admin insert/delete.
- **`profiles.notification_preferences`** — jsonb for email / summary / threshold UI.
- **`workspaces` DELETE** — owner-only policy for workspace removal.

Migration: `supabase/migrations/20250513000000_core_pages_workspace_extensions.sql` and `supabase/migrations/20250519000000_apps_metadata.sql`; optional **`apps.icon_url`** column: `supabase/migrations/20260513000000_apps_icon_url.sql`. Overview: `docs/core-pages.md`.

## Notes
- Keep relations simple.
- Store timestamps for trends.
- Index high-usage columns.
- Support multi-workspace users.
- Keep app-level and workspace-level data separate.

## Data Priorities
- Fast reads for dashboard views.
- Reliable history for rank tracking.
- Easy filtering by app, market, and date.
