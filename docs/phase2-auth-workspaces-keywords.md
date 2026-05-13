# Phase 2 — Auth, workspaces, keywords, alerts

This document is the **implementation source of truth** for Phase 2 alongside `docs/architecture.md` and `docs/database.md`.

## Auth flow

1. **Sign up / sign in** — Email + password via Supabase Auth (`/signup`, `/login`). The browser uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` with `@supabase/ssr` `createBrowserClient` (`lib/supabase/client.ts`).
2. **Session cookies** — Root `middleware.ts` creates a Supabase server client bound to the request/response cookies, calls `getUser()`, and refreshes the session on each matched request.
3. **OAuth-style callback** — `GET /auth/callback` exchanges `code` for a session using the server client (`app/auth/callback/route.ts`) and redirects to `next` (default `/app`).
4. **Protected areas** — `/app/**` and `/onboarding` require an authenticated user (middleware redirect to `/login?next=…`).
5. **Profiles** — Row in `public.profiles` is created by trigger `on_auth_user_created` on `auth.users` (`handle_new_user`). Users can read/update their own profile; they can **read teammate profiles** in shared workspaces via `profiles_select_workspace_peers` (for the Team roster).

## Workspace flow

1. After first login, `/app` redirects to `/onboarding` if the user has **no** workspace rows visible under RLS.
2. **Create workspace** — `POST /api/workspaces` with `{ "name": "…" }` inserts `workspaces` with `created_by = auth.uid()`. Trigger `on_workspace_created` inserts `workspace_members` as **owner**.
3. **Default app** — The same API inserts one `apps` row (`Primary Google Play app`) so keywords can attach to `app_id`.
4. **Onboarding flag** — `profiles.onboarding_completed_at` is set when the workspace is created.
5. **Navigation** — Users land on `/app/[workspaceId]` (overview). Layout verifies membership by selecting the workspace; if RLS returns nothing, Next.js `notFound()` runs.

## Roles

- `workspace_members.role` is one of **`owner`**, **`admin`**, **`member`**.
- Phase 2 **does not** include invite-by-email or role-change APIs; new members would require a follow-up feature or a manual SQL insert by an admin. UI surfaces current members on **Team** (`/app/[workspaceId]/settings`).

## Keyword flow

1. **Create keyword** — `POST /api/workspaces/:workspaceId/keywords` with `{ "term": "…", "market"?: "us", "locale"?: "en-US", "appId"?: uuid }`. If `appId` is omitted, the **first** app in the workspace is used. Duplicate normalized term per app + market returns **409**. New rows have no rank snapshots until Serper **save** or **refresh** (or manual `POST …/ranks`).
2. **Bulk add from AI listing** — `POST /api/workspaces/:workspaceId/keywords/bulk` with `{ "terms": string[], "appId": uuid, "listingGenerationId": uuid }` adds multiple suggested keywords from a saved **`listing_generations`** row; applies AI credit pricing (first **5** per generation free, then **2** credits per keyword by default). Rows store **`source = ai_listing`** and **`listing_generation_id`**.
3. **List + history** — `GET` supports optional `?appId=` filter. Response keywords include up to **40** recent rank points per term (chronological `ranks` + `latest`) from **`keyword_rank_snapshots`**. Optional **`ensureDemoSnapshots: true`** on `loadWorkspaceKeywords` (tests only) inserts demo rows when a keyword has no snapshots; production pages leave this off.
4. **Delete keyword** — `DELETE /api/workspaces/:workspaceId/keywords/:keywordId` removes the keyword (ranks cascade).
5. **Record rank snapshot** — `POST /api/workspaces/:workspaceId/keywords/:keywordId/ranks` with `{ "rank": number, "source"?: "manual" }`. Lower rank is better on Google Play.
6. **Trends in UI** — Workspace **Keyword tracker** (`/keywords`) uses `components/keyword-tracker/KeywordTrackerClient.tsx`: Supabase-backed table, app scope selector, Sonner toasts, rank history dialog, 7‑day sparkline + delta from stored snapshots.
7. **Play Store data** — Live Google results via Serper (`POST /api/serper/play-store-search`, **`POST …/keywords/serper-save`**, **`POST …/keywords/:keywordId/serper-refresh`**) persist **`source = serper`** snapshots. Rank **101** means the app was not in the first organic page (`num: 20`); the UI may label that as “20+”. Optional demo snapshots remain for local/testing via `loadWorkspaceKeywords({ ensureDemoSnapshots: true })`.

## Alerts flow

1. After each new rank insert, `maybeCreateRankAlerts` (`lib/keywords/evaluate-alerts.ts`) compares to the **previous** snapshot:
   - **`rank_drop`** — New rank is worse than previous by more than **3** positions.
   - **`rank_threshold`** — Previously in the **top 10**, now **outside** the top 10.
2. Rows land in `workspace_alerts`. Members list them under **Alerts**; `PATCH /api/workspaces/:workspaceId/alerts` with `{ "alertIds": ["…"] }` sets `read_at`.

## RLS summary

- All tenant tables use **`workspace_id`** (or join through `keywords`) and **`is_workspace_member(workspace_id)`** (security definer SQL helper) for read/write.
- **`listing_generations`** requires `workspace_id` + `user_id = auth.uid()` for inserts; legacy rows with null `workspace_id` are not visible to authenticated policies.
- **`usage_logs`** / **`rate_limit_buckets`** remain service-role–oriented; listing generation still uses the service role only for **rate limit RPC** and **usage logging**, while **persisting listings** uses the user-scoped server client so RLS applies.

## Migrations

- Apply `supabase/migrations/20250512000000_phase2_auth_workspaces_keywords.sql` after Phase 1 migration.
- Ensure **Email** auth is enabled in the Supabase dashboard; for local dev you may disable “Confirm email” to avoid the extra click.
