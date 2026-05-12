# Database

## Main Tables
- users
- workspaces
- apps
- keywords
- keyword_ranks
- competitors
- reviews
- listings
- localization_suggestions
- alerts
- scores
- notes

## Phase 1 MVP additions (live schema)

These support the AI App Listing Optimizer and operational controls:

- **listing_generations** — Inputs (app name, category, keywords array, features, tone) plus `output_json`, `model`, `prompt_version`, `client_ip`, timestamps.
- **usage_logs** — Per-request logging: `route`, `client_ip`, `success`, `duration_ms`, optional `error_message`, optional `meta` JSON.
- **rate_limit_buckets** — Composite key `(key, window_start)` with `count` for fixed-window rate limiting.
- **public.consume_rate_limit(p_key text, p_max int)** — `SECURITY DEFINER` RPC; returns JSON `{ allowed, count }`. Executable by `service_role` only (see migration).

### Workspace AI credits (wallet + ledger)

- **`credits_ledger`** — Append-only movements; negative `amount` = spend, positive = refund or top-up.
- **`consume_workspace_ai_credits(p_workspace_id, p_user_id, p_amount, p_description, p_source_type, p_meta)`** — `SECURITY DEFINER`; verifies member + caller, locks the workspace row (`FOR UPDATE`), returns `insufficient_credits` if `ai_credits_remaining < p_amount`, otherwise debits and inserts a spend row. Granted to `authenticated` and `service_role`.
- **`refund_workspace_ai_credits(p_ledger_id, p_user_id, p_reason)`** — Reverses a prior spend (idempotent when already refunded). Granted to `authenticated` and `service_role`.

Migration: `supabase/migrations/20250516000000_credits_ledger_wallet.sql`. See also `docs/architecture.md` and `docs/api.md`.

## Phase 2 additions (auth, workspaces, keywords)

- **profiles** — `id` → `auth.users`, `display_name`, `onboarding_completed_at`. RLS: self read/update; **peer read** for users who share a workspace (roster).
- **workspaces** — `name`, **`owner_id`** (uuid, not null, FK → `auth.users`, canonical owner), **`created_by`** (uuid, not null, FK → `auth.users`; must equal `owner_id`). A **before insert/update** trigger (`workspaces_owner_columns_sync`) mirrors the two when only one is supplied and rejects conflicting values. Timestamps. RLS: members read; authenticated inserts require **`created_by = auth.uid()` and `owner_id = auth.uid()`**; owners/admins update name.
- **workspace_members** — Composite PK `(workspace_id, user_id)`, `role` in (`owner`,`admin`,`member`). Owner row is created by the `on_workspace_created` trigger (`handle_new_workspace`, uses `coalesce(owner_id, created_by)`) and is also inserted defensively by **`public.create_new_workspace(text)`** with `ON CONFLICT DO NOTHING`. RLS: roster visible to members.
- **apps** — `workspace_id`, `name`, optional `package_name`, optional `metadata` (jsonb, default `{}`) for ASO extras (`category`, `short_description`, `icon_url`). Default app created with first workspace. RLS: member CRUD (delete limited to owner/admin per policy).
- **keywords** — `workspace_id`, `app_id`, `term`, `market`, `locale`, optional `notes`. Unique `(workspace_id, app_id, lower(trim(term)), market)`.
- **keyword_ranks** — `keyword_id`, `rank` (nullable), `captured_at`, `source` (e.g. `manual`). Indexed for time-series reads.
- **workspace_alerts** — `workspace_id`, optional `keyword_id`, `type` (`rank_drop` | `rank_threshold`), copy fields, `read_at`, `meta` JSON.
- **listing_generations (Phase 2 columns)** — `workspace_id` FK, `user_id` FK; RLS policies for `authenticated` require membership + `user_id = auth.uid()` on insert.

Helpers: **`public.is_workspace_member(uuid)`**, **`public.workspace_role(uuid)`** (both `SECURITY DEFINER`, granted to `authenticated`).

**`public.create_new_workspace(p_name text) → uuid`** — `SECURITY DEFINER`, `search_path = pg_catalog, public`. Callable by `authenticated` and `service_role`. Reads the caller with `(select auth.uid())`; if null, raises a clear exception. Trims `p_name` and requires length ≥ 2. Inserts `workspaces` with **`created_by` and `owner_id` both set to `auth.uid()`**, then inserts **`workspace_members`** with **`role = 'owner'`** and `ON CONFLICT (workspace_id, user_id) DO NOTHING`, then seeds the default app and a sample `listing_generations` row. Returns the new workspace `id`. App entrypoint: `POST` `/api/workspaces` via `supabase.rpc('create_new_workspace', { p_name })`. Migration: `supabase/migrations/20250521000000_workspaces_owner_id_and_create_new_workspace.sql` (adds `owner_id`, sync trigger, RLS tweak, and replaces the function; supersedes `20250520000000_*` and earlier RPC migrations).

Full DDL + policies: `supabase/migrations/20250512000000_phase2_auth_workspaces_keywords.sql`. Narrative: `docs/phase2-auth-workspaces-keywords.md`.

## Core pages extensions

- **`workspaces.plan`** — `starter` \| `pro` \| `agency` (text, default starter).
- **`workspaces.onboarding_state`** — jsonb for guided onboarding progress (`completed`, `step`, etc.).
- **`apps.play_store_url`**, **`apps.target_countries`**, **`apps.metadata`** — optional Play listing context; `metadata` holds ASO fields not modeled as top-level columns (e.g. category, short description, icon URL).
- **`workspace_invitations`** — pending invites (`email`, `role` admin|member, `invited_by`); unique per workspace + lower(email). RLS: members read; owner/admin insert/delete.
- **`profiles.notification_preferences`** — jsonb for email / summary / threshold UI.
- **`workspaces` DELETE** — owner-only policy for workspace removal.

Migration: `supabase/migrations/20250513000000_core_pages_workspace_extensions.sql` and `supabase/migrations/20250519000000_apps_metadata.sql`. Overview: `docs/core-pages.md`.

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
