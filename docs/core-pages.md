# Core app pages (Phase UI)

## Source of truth

Page-level product specs live in **`app-pages/`** (`home.md`, `pricing.md`, `onboarding.md`, `dashboard-home.md`, `settings.md`). Implementations mirror those files; `docs/` may keep summaries but **`app-pages/` wins** on copy and section structure.

## Routes

| Spec | Route | Implementation |
|------|--------|----------------|
| `app-pages/home.md` | `/` | `app/(site)/page.tsx` + `components/marketing/*` |
| `app-pages/pricing.md` | `/pricing` | `app/(site)/pricing/page.tsx` |
| `app-pages/onboarding.md` | `/onboarding` | `app/onboarding/page.tsx` + `components/onboarding/OnboardingWizard.tsx` |
| `app-pages/dashboard-home.md` | `/app/[workspaceId]` | `app/app/[workspaceId]/page.tsx` + `loading.tsx` |
| `app-pages/settings.md` | `/app/[workspaceId]/settings` | `app/app/[workspaceId]/settings/page.tsx` + `components/settings/SettingsTabs.tsx` |

Public marketing uses route group **`(site)`** for shared header/footer without changing URLs.

## Architecture decisions

1. **Onboarding state** — `workspaces.onboarding_state` (jsonb) tracks wizard progress; `completed: true` is set via `POST /api/workspaces/:id/onboarding/complete`, which also sets `profiles.onboarding_completed_at`. Legacy rows with `null` state are treated as completed (`lib/onboarding-state.ts`). `/app` redirects to `/onboarding` if any workspace is incomplete.
2. **Plans & limits** — `workspaces.plan` (`starter` \| `pro` \| `agency`) with display limits in `lib/plan-limits.ts`. Owners may PATCH plan for testing until Stripe is wired.
3. **Invites** — `workspace_invitations` stores pending email invites (RLS: owners/admins insert). No email worker in-repo; teammates accept by signing up with the same email (manual join can be automated later).
4. **Apps** — Optional `play_store_url`, `target_countries` on `apps` for onboarding step 3.
5. **Profile prefs** — `profiles.notification_preferences` jsonb for the Notifications tab (email alerts, weekly summary, alert threshold UI).
6. **Settings** — Single-page tabs (client) with server-fetched workspace, apps, members, invitations, profile, keyword count.
7. **Dashboard** — Combines real counts (keywords, alerts, listing generations) with placeholder metrics where product features are not shipped yet (review sentiment, localization), labeled in UI.

## Migrations

Apply after Phase 2 SQL:

- `supabase/migrations/20250513000000_core_pages_workspace_extensions.sql` — `plan`, `onboarding_state`, `apps` columns, `workspace_invitations`, `workspaces` delete policy for owner, `profiles.notification_preferences`.

## Env vars

No new variables beyond existing Supabase + Gemini. Optional: set `NEXT_PUBLIC_SITE_URL` for absolute links in future emails (not required for current UI).

## E2E smoke flow

1. Visit `/` — hero, features, social proof, CTA, footer; `/pricing` from nav.
2. `/signup` → `/onboarding` — full wizard: welcome → workspace → app → keywords → insight → complete → `/app/:id` home.
3. Dashboard: metrics, activity, quick actions, workspace list; switch workspace from sidebar control if multiple.
4. `/app/:id/settings` — each tab loads; invite email; owner changes plan; save notifications & profile.
5. Delete workspace (owner) returns to `/app` (redirect to onboarding if no workspaces left).
