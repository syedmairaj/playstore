# Architecture

## Recommended Stack
- Frontend: Next.js or React.
- Styling: Tailwind CSS.
- Backend: Node.js API routes or separate Node service.
- Database: PostgreSQL.
- Auth: Supabase or Clerk.
- AI: OpenAI-compatible API (Phase 1 MVP listing optimizer uses **Google Gemini** via `@google/generative-ai`; other modules may stay OpenAI-compatible later).
- Jobs: Background worker for tracking and alerts.

## Phase 1 MVP (implemented)

- **App shell:** Next.js App Router at repo root, Tailwind, single primary screen for the AI App Listing Optimizer (`app/page.tsx`).
- **Generation:** Server route `POST /api/listings/generate` calls Gemini with JSON-only responses; prompts live under `lib/prompts/`.
- **Persistence & ops:** Supabase (PostgreSQL) stores `listing_generations` and `usage_logs`; rate limits use table `rate_limit_buckets` + RPC `consume_rate_limit` (see `docs/listing-optimizer.md` and `supabase/migrations/`).
- **Secrets:** `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-only; never expose the service role to the client.

## Phase 2 (implemented)

- **Auth:** Supabase email/password, cookie sessions via `@supabase/ssr`, `middleware.ts` refresh, `/auth/callback` exchange route, `/login` and `/signup`.
- **Onboarding:** `/onboarding` creates the first **workspace** + default **app** via `POST /api/workspaces`; `/app` hub redirects into `/app/[workspaceId]`.
- **Tenancy:** `workspaces`, `workspace_members` (roles `owner` | `admin` | `member`), `apps`, `keywords`, `keyword_ranks`, `workspace_alerts`; all tenant data scoped by `workspace_id` with **RLS** (`is_workspace_member`, see migration).
- **Product UI:** Overview, Keywords (history + sparkline + manual rank snapshots), Alerts (read/mark read), Listing AI (workspace-scoped), Team roster (`/settings`).
- **Listing generations:** Rows require `workspace_id` + `user_id`; API requires a signed-in user (see `docs/phase2-auth-workspaces-keywords.md`).
- **Public anon key:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` for browser and server user-scoped clients; service role remains for rate limit + `usage_logs` only.

## Core marketing & dashboard UI (implemented)

- **Page specs:** `app-pages/*.md` are canonical for the five core surfaces (see `docs/core-pages.md`).
- **Marketing:** Route group `app/(site)/` provides `/`, `/pricing`, `/privacy`, `/terms` with shared `SiteHeader` / `SiteFooter`.
- **Onboarding wizard:** Multi-step client flow aligned with `app-pages/onboarding.md`; persists `workspaces.onboarding_state` and completes via `POST .../onboarding/complete`.
- **Dashboard home:** `/app/[workspaceId]` per `app-pages/dashboard-home.md` — plan/usage line, metrics mix (real + placeholders), activity feed, quick actions, workspace list, `WorkspaceSwitcher` in layout when multiple workspaces exist.
- **Settings:** Tabbed `/app/[workspaceId]/settings` per `app-pages/settings.md` — workspace, team + invites, billing stubs, integrations placeholders, notification prefs JSON, account + sign out.

## System Modules
- Authentication and onboarding.
- Workspace and app management.
- Keyword tracking engine.
- AI metadata generation engine.
- Competitor analysis service.
- Review analysis service.
- Localization engine.
- ASO score service.
- Notifications and alerts service.

## Launch architecture (Phase 1)

### Feature flags
- **Source of truth:** Supabase table `feature_flags` (see `supabase/migrations/20250515000000_feature_flags.sql`) with public `SELECT` for `anon` + `authenticated`.
- **Overrides:** `NEXT_PUBLIC_FF_<KEY>` env vars (upper snake of flag key, e.g. `NEXT_PUBLIC_FF_KEYWORD_TRACKER=false`) merged in `lib/features/flags/resolve.ts` — **env wins** over DB.
- **Server API:** `getFeatureFlags(supabase)` in `lib/features/flags/server.ts` for RSC and workspace layout.
- **Public JSON:** `GET /api/feature-flags` for clients or edge caches (short `s-maxage`).

### Code layout (`lib/features`, `components/features`)
- **`lib/features/core/`** — tenancy, plans, pricing (barrel re-exports today; migrate implementations gradually).
- **`lib/features/flags/`** — flag keys, defaults, merge, server loader.
- **`lib/features/product/<module>/`** — domain logic per surface (e.g. `product/aso/checklist.ts`). Add `product/ranking-tracker/`, `product/alerts-advanced/`, etc. as modules ship.
- **`components/features/<module>/`** — shared UI for that module (e.g. `components/features/aso/aso-score-panel.tsx`).

### Error monitoring
- **Vercel:** Serverless `console.error` and failed route handlers appear in the Vercel project **Logs** / Observability tab.
- **Sentry (optional):** Set `SENTRY_DSN` for Node + Edge (`instrumentation.ts` loads `sentry.server.config.ts` / `sentry.edge.config.ts`). Set `NEXT_PUBLIC_SENTRY_DSN` for browser capture via `SentryClientInit` in `components/providers.tsx`. Omit DSNs locally if unused.


## Data Flow
1. User creates workspace.
2. User adds app details.
3. System tracks keywords and app data.
4. AI generates listing suggestions.
5. Review and competitor data are processed.
6. Dashboard shows recommendations and alerts.

## Architecture Principles
- Keep the system simple.
- Separate concerns clearly.
- Use reusable services.
- Avoid unnecessary abstraction.
- Make it easy to maintain.
- Favor readable code over clever code.



new data:

1. Core Stack & Infrastructure
Framework: Next.js 16 (App Router) at repo root.

Database & Auth: Supabase (PostgreSQL) with RLS for multi-tenancy.

AI Engine: Multi-Model Orchestrator.

Claude 3.5 Sonnet: Primary for ASO and long-form App Descriptions.

Google Gemini 1.5 Pro: Used for Competitor Analysis and large-context scans.

GPT-4o-mini: Used for rapid-fire Ad Copy and Push Notifications.

Queue/Background: Inngest or Vercel Cron for keyword rank tracking.

2. Advanced Tenancy & Wallet (The $2k/mo Engine)
The system moves from simple rate-limiting to a Consumption-based Wallet.

Workspace-Level Credits: Credits are owned by the workspace, not the individual user, allowing team collaboration.

Immutable Ledger: Every AI generation must create a record in credits_ledger before the API returns the result.

Credit Costs:

ASO Growth Pack: 5 Credits.

Ad Copy / Push Hooks: 1 Credit.

Localization: 2 Credits.

3. System Modules (v2)
AI Orchestrator (lib/features/ai/): Manages prompt injection, model selection, and streaming chunks to the UI.

Wallet & Billing (lib/features/billing/): Handles Stripe Webhooks, credit replenishment, and consumption checks.

Visualizer Service (components/features/visualizer/): A specialized UI component that renders AI JSON into real-time mockups (Phone, FB Ad, Play Store listing).

Keyword Pipeline: Automated daily tracking of SERP positions via Supabase Edge Functions.

Localization Engine: Specialized prompts for MENA region (Arabic MSA/Gulf) and global markets.

4. Database Schema (Additions)
credits_ledger: id, workspace_id, amount, description, source_type (generation/purchase).

ai_generations: Updated to include tool_type (aso, ads, push) and metadata (model used, tokens spent).

competitor_tracking: Stores competitor package names and their historical rank shifts.

5. The "Growth Loop" Data Flow
Ingestion: User adds an app; system triggers a background scan of current Play Store metadata.

Audit: ASO Score service analyzes current keywords vs. competitors.

Generation: User selects a tool. The AI Orchestrator fetches the "App Context" (keywords, score, category) and sends it to the best model.

Live Stream: Text streams into the Mobile Visualizer on the dashboard.

Deduction: On successful stream completion, the Wallet Service commits the credit deduction.

6. Implementation Principles
Agentic Prompts: Don't just ask for a description; provide the AI with the "Current Rank" and "Target Keywords" as context.

Failsafe Auth: Use middleware.ts to ensure users with negative credit balances are redirected to the pricing page.

Shadow Mode: New features ship under FF_ (Feature Flags) in lib/features/flags/ before public release.

7. Code Layout
lib/features/product/growth-suite/ — Logic for Ad copy, Push hooks, and ASO bundles.

lib/features/billing/ — Wallet, ledger logic, and Stripe integration.

components/features/visualizer/ — The CSS-based Phone Frame and Mockup components.

---

## Implemented: workspace wallet + ledger (listing AI)

- **Table:** `credits_ledger` (append-only; negative `amount` = spend, positive = refund/top-up).
- **RPCs:** `consume_workspace_ai_credits` (member + balance check, row lock, debit + ledger row) and `refund_workspace_ai_credits` (reverses a spend; idempotent via `already_refunded`).
- **API:** `POST /api/listings/generate`, `POST /api/listings/optimizer-autofill`, and `POST /api/apps/suggest` read `ai_credits_remaining` (non-mutating) when credits are required, then call `consumeWorkspaceAiCredits` **before** Gemini (`SELECT … FOR UPDATE` in the RPC); on generation failure they call `refundWorkspaceAiCredits`, so **net balance matches a successful AI outcome**. Successful full listing runs persist `listing_generations.credits_ledger_id` and `tool_type = aso_listing`. Autofill does not create a `listing_generations` row.
- **Costs:** `lib/features/billing/credit-costs.ts` — `listing_generation` = **5** credits per full listing run (including regenerate with `userInstruction`); `listing_optimizer_autofill` = **3** credits per single-field autofill click (keywords or features); bundle costs like ASO Growth Pack = 5 remain reserved for bundled workflows.

### AI Image Engine (Runware Integration)
- **Endpoint:** `https://api.runware.ai/v1`
- **Model:** Flux.1 (Dev or Schnell) or Stable Diffusion XL.
- **Workflow:** 
  1. Frontend sends a "Logo Prompt" to a Next.js Server Action.
  2. Server Action calls Runware via WebSocket or REST.
  3. Runware returns a CDN URL for the generated icon.
  4. The URL is passed to the `LivePreview` component.
