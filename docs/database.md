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

- **listing_generations** — Inputs (app name, category, keywords array `target_keywords`, features `app_features`, tone) plus optional **`output_json`** (full Gemini listing JSON; **nullable** for AI-autofill-only input snapshots before a full listing run), `model`, `prompt_version`, `client_ip`, timestamps.
- **usage_logs** — Per-request logging: `route`, `client_ip`, `success`, `duration_ms`, optional `error_message`, optional `meta` JSON.
- **rate_limit_buckets** — Composite key `(key, window_start)` with `count` for fixed-window rate limiting.
- **public.consume_rate_limit(p_key text, p_max int)** — `SECURITY DEFINER` RPC; returns JSON `{ allowed, count }`. Executable by `service_role` only (see migration).

### Workspace AI credits (wallet + ledger)

- **`credits_ledger`** — Append-only movements; negative `amount` = spend, positive = refund or top-up.
- **`consume_workspace_ai_credits(p_workspace_id, p_user_id, p_amount, p_description, p_source_type, p_meta)`** — `SECURITY DEFINER`; verifies member + caller, locks the workspace row (`FOR UPDATE`), returns `insufficient_credits` if `ai_credits_remaining < p_amount`, otherwise debits and inserts a spend row. Granted to `authenticated` and `service_role`.
- **`refund_workspace_ai_credits(p_ledger_id, p_user_id, p_reason)`** — Reverses a prior spend (idempotent when already refunded). Granted to `authenticated` and `service_role`.

**Admin (site operators)** — **`admin_financial_snapshot(p_series_from date, p_series_to date)`** — `SECURITY DEFINER`; callable when **`profiles.is_admin`** is true **or** **`profiles.role = 'admin'`** for **`auth.uid()`** (no matching row → not admin). Returns JSON `{ ok, code }` on failure (e.g. `forbidden`) or aggregates on success. Migrations: `supabase/migrations/20260513120000_profiles_is_admin_admin_financial_rpc.sql`, then `supabase/migrations/20260513130000_profiles_role_site_admin.sql`. Setup and troubleshooting: [`docs/admin-financial-setup.md`](./admin-financial-setup.md).

Migration: `supabase/migrations/20250516000000_credits_ledger_wallet.sql`. See also `docs/architecture.md` and `docs/api.md`.

## Phase 2 additions (auth, workspaces, keywords)

- **profiles** — `id` → `auth.users`, `display_name`, `onboarding_completed_at`, optional **`is_admin`** (boolean, default false), optional **`role`** (e.g. `'admin'` for site operators; same effect as `is_admin` for `/admin/*` and `admin_financial_snapshot`). RLS: self read/update; **peer read** for users who share a workspace (roster).
- **workspaces** — `name`, **`owner_id`** (uuid, not null, FK → `auth.users`, canonical owner), **`created_by`** (uuid, not null, FK → `auth.users`; must equal `owner_id`). A **before insert/update** trigger (`workspaces_owner_columns_sync`) mirrors the two when only one is supplied and rejects conflicting values. Timestamps. RLS: members read; authenticated inserts require **`created_by = auth.uid()` and `owner_id = auth.uid()`**; owners/admins update name.
- **workspace_members** — Composite PK `(workspace_id, user_id)`, `role` in (`owner`,`admin`,`member`). Owner row is created by the `on_workspace_created` trigger (`handle_new_workspace`, uses `coalesce(owner_id, created_by)`) and is also inserted defensively by **`public.create_new_workspace(text)`** with `ON CONFLICT DO NOTHING`. RLS: roster visible to members.
- **apps** — `workspace_id`, `name`, optional `package_name`, optional **`icon_url`** (text, HTTPS app listing icon; preferred over duplicate in metadata when present), optional `metadata` (jsonb, default `{}`) for ASO extras (`category`, `short_description`, `icon_url` mirror for older clients). Default app created with first workspace. RLS: member CRUD (delete limited to owner/admin per policy).
- **keywords** — `workspace_id`, optional **`app_id`** (nullable for workspace-wide tracking), `term`, optional generated **`keyword`** (trimmed term), `market`, `locale`, optional `notes`, optional **`source`** (e.g. `ai_listing`), optional **`listing_generation_id`** (FK → `listing_generations`, nullable), **`best_rank`** (rolling best / lowest rank), **`updated_at`**. Unique tracked term per workspace/app/market via partial unique indexes (`keywords_unique_term_with_app`, `keywords_unique_term_workspace_only`).
- **keyword_rank_snapshots** — `keyword_id`, **`rank`**, **`best_rank`** (running minimum per snapshot row), optional **`search_volume`**, **`snapshot_at`**, **`source`** (`manual`, `demo`, `serper`, etc.). Replaces legacy `keyword_ranks`; indexed by `(keyword_id, snapshot_at)`. RLS mirrors keyword membership.
- **keyword_rank_history** (view) — Flattened snapshots joined to `keywords` (`workspace_id`, `keyword`, ranks, `snapshot_date`) for analytics and exports.

Migration: `supabase/migrations/20260514120000_keyword_rank_snapshots.sql` (supersedes `keyword_ranks` from Phase 2 DDL after migrate).
- **workspace_alerts** — `workspace_id`, optional `keyword_id`, `type` (`rank_drop` | `rank_threshold`), copy fields, `read_at`, `meta` JSON.
- **listing_generations (Phase 2 columns)** — `workspace_id` FK, `user_id` FK, optional **`app_id`** FK → `apps` (scopes a run to a workspace app for Keyword Tracker); RLS policies for `authenticated` require membership + `user_id = auth.uid()` on insert.

Helpers: **`public.is_workspace_member(uuid)`**, **`public.workspace_role(uuid)`** (both `SECURITY DEFINER`, granted to `authenticated`).

**`public.create_new_workspace(p_name text) → uuid`** — `SECURITY DEFINER`, `search_path = pg_catalog, public`. Callable by `authenticated` and `service_role`. Reads the caller with `(select auth.uid())`; if null, raises a clear exception. Trims `p_name` and requires length ≥ 2. Inserts `workspaces` with **`created_by` and `owner_id` both set to `auth.uid()`**, then inserts **`workspace_members`** with **`role = 'owner'`** and `ON CONFLICT (workspace_id, user_id) DO NOTHING`, then seeds the default app and a sample `listing_generations` row. Returns the new workspace `id`. App entrypoint: `POST` `/api/workspaces` via `supabase.rpc('create_new_workspace', { p_name })`. Migration: `supabase/migrations/20250521000000_workspaces_owner_id_and_create_new_workspace.sql` (adds `owner_id`, sync trigger, RLS tweak, and replaces the function; supersedes `20250520000000_*` and earlier RPC migrations).

Full DDL + policies: `supabase/migrations/20250512000000_phase2_auth_workspaces_keywords.sql`. Narrative: `docs/phase2-auth-workspaces-keywords.md`.

## Core pages extensions

- **`workspaces.plan`** — `starter` \| `pro` \| `agency` (text, default starter).
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
