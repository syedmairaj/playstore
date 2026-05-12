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

## Phase 2 additions (auth, workspaces, keywords)

- **profiles** — `id` → `auth.users`, `display_name`, `onboarding_completed_at`. RLS: self read/update; **peer read** for users who share a workspace (roster).
- **workspaces** — `name`, `created_by`, timestamps. RLS: members read; authenticated users insert own `created_by`; owners/admins update name.
- **workspace_members** — Composite PK `(workspace_id, user_id)`, `role` in (`owner`,`admin`,`member`). Owner row created by trigger on workspace insert. RLS: roster visible to members.
- **apps** — `workspace_id`, `name`, optional `package_name`. Default app created with first workspace. RLS: member CRUD (delete limited to owner/admin per policy).
- **keywords** — `workspace_id`, `app_id`, `term`, `market`, `locale`, optional `notes`. Unique `(workspace_id, app_id, lower(trim(term)), market)`.
- **keyword_ranks** — `keyword_id`, `rank` (nullable), `captured_at`, `source` (e.g. `manual`). Indexed for time-series reads.
- **workspace_alerts** — `workspace_id`, optional `keyword_id`, `type` (`rank_drop` | `rank_threshold`), copy fields, `read_at`, `meta` JSON.
- **listing_generations (Phase 2 columns)** — `workspace_id` FK, `user_id` FK; RLS policies for `authenticated` require membership + `user_id = auth.uid()` on insert.

Helpers: **`public.is_workspace_member(uuid)`**, **`public.workspace_role(uuid)`** (both `SECURITY DEFINER`, granted to `authenticated`).

Full DDL + policies: `supabase/migrations/20250512000000_phase2_auth_workspaces_keywords.sql`. Narrative: `docs/phase2-auth-workspaces-keywords.md`.

## Core pages extensions

- **`workspaces.plan`** — `starter` \| `pro` \| `agency` (text, default starter).
- **`workspaces.onboarding_state`** — jsonb for guided onboarding progress (`completed`, `step`, etc.).
- **`apps.play_store_url`**, **`apps.target_countries`** — optional Play listing context.
- **`workspace_invitations`** — pending invites (`email`, `role` admin|member, `invited_by`); unique per workspace + lower(email). RLS: members read; owner/admin insert/delete.
- **`profiles.notification_preferences`** — jsonb for email / summary / threshold UI.
- **`workspaces` DELETE** — owner-only policy for workspace removal.

Migration: `supabase/migrations/20250513000000_core_pages_workspace_extensions.sql`. Overview: `docs/core-pages.md`.

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
