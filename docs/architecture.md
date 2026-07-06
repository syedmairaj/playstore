# Architecture

## Recommended Stack
- Frontend: Next.js or React.
- Styling: Tailwind CSS.
- Backend: Node.js API routes or separate Node service.
- Database: PostgreSQL.
- Auth: Supabase or Clerk.
- AI: OpenAI-compatible API (Phase 1 MVP listing optimizer uses **Google Gemini** via `@google/generative-ai`; other modules may stay OpenAI-compatible later).
- Jobs: **Upstash QStash** for async listing generation (`POST /api/listings/worker`); keyword rank tracking/alerts may use background workers later.

## Phase 1 MVP (implemented)

- **App shell:** Next.js App Router at repo root, Tailwind, single primary screen for the AI App Listing Optimizer (`app/page.tsx`).
- **Generation:** Server route `POST /api/listings/generate` calls Gemini with JSON-only responses; prompts live under `lib/prompts/`.
- **Persistence & ops:** Supabase (PostgreSQL) stores `listing_generations` and `usage_logs`; rate limits use table `rate_limit_buckets` + RPC `consume_rate_limit` (see `docs/listing-optimizer.md` and `supabase/migrations/`).
- **Secrets:** `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are server-only; never expose the service role to the client.

## Phase 2 (implemented)

- **Auth:** Supabase email/password, cookie sessions via `@supabase/ssr`, `middleware.ts` refresh, `/auth/callback` exchange route, `/login` and `/signup`.
- **Onboarding:** `/onboarding` creates the first **workspace** + default **app** via `POST /api/workspaces`; `/app` hub redirects into `/app/[workspaceId]`.
- **Tenancy:** `workspaces`, `workspace_members` (roles `owner` | `admin` | `member`), `apps`, `keywords`, `keyword_rank_snapshots`, `workspace_alerts`; all tenant data scoped by `workspace_id` with **RLS** (`is_workspace_member`, see migration).
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

---

## Listing versioning — stateful growth workflow (Session 6, June 2026)

The ASO Listing Optimizer now maintains a **version history** that maps every completed pipeline run to a `ListingVersion` row. Status advances manually: `draft` → `published` → `deployed`.

### Version lifecycle

```
POST /api/listings/generate  (producer — async path)
  → createListingVersion(workspaceId, appId, vaultLocale, source_job_id=jobId)
  → 202 { jobId, versionId, ... }

Worker completes job
  → populateListingVersionByJobId(jobId, { title, short, long, keywords })
  → version.status stays "draft" with full content

User reviews in DeploymentView
  → PATCH /api/workspaces/:id/listing-versions/:versionId  { action: "publish" }
  → version.status = "published", published_at set

User deploys to Play Console
  → PATCH /api/workspaces/:id/listing-versions/:versionId  { action: "deploy" }
  → version.status = "deployed", deployed_at set
```

### Screenshot captions step

A new `captions` generation step derives 7 Play Store screenshot captions from the long description's tone and voice. The step is non-credit-billed and can run after `pipeline` completes. Captions are stored in `listing_versions.screenshot_captions` and shown in the **DeploymentView** carousel section.

### Key new modules

| Module | Role |
|--------|------|
| `src/lib/listing/listing-version.types.ts` | `ListingVersion`, `ScreenshotCaption`, `LiveListingSnapshot`, `CaptionsStepData` types |
| `src/lib/db/listing-versions.ts` | CRUD layer for `listing_versions` table |
| `src/lib/gemini/generate-screenshot-captions.ts` | `generateListingPipelineCaptions()` for the `captions` step |
| `src/components/listing/deployment-view.tsx` | Side-by-side live vs draft comparison UI |
| `src/components/listing/version-history-panel.tsx` | Version list + embedded DeploymentView |
| `app/api/workspaces/[workspaceId]/listing-versions/route.ts` | `GET` (list) + `POST` (create) |
| `app/api/workspaces/[workspaceId]/listing-versions/[versionId]/route.ts` | `GET` (single) + `PATCH` (status/actions) |

### EN/AR support

Both `vault_locale = 'en'` and `vault_locale = 'ar'` versions are tracked independently. `DeploymentView` and `VersionHistoryPanel` accept an `isRtl` prop. All i18n keys are under `optimizer.deployment.*` and `optimizer.versionHistory.*`.

---

## Listing generation — async producer/worker (Session 5, June 2026)

Long modular pipelines exceed Vercel serverless timeouts. Generation is split into a **producer** (user-facing) and **worker** (background).

### Flow

```
Client → POST /api/listings/generate (producer)
  → auth, credit precheck, context gateway (stamp + compile)
  → orchestrator executionMode: "read" (phase guard only)
  → if WAITING_FOR_PHASES → 202 (client polls jobId)
  → Redis SET NX lock on (workspaceId, queueHash)
  → upsert workspace_listing_drafts (pending, job_id)
  → QStash publish → POST /api/listings/worker
  → 202 { jobId, status: "pending" }

Worker → POST /api/listings/worker
  → verify QStash signature (or INTERNAL_WORKER_SECRET in dev)
  → executionMode: "execute" → runListingGenerationOrchestrator
  → serialized pipeline: title → short → long (phase guard between steps)
  → post-success credit debit → generation_status: completed
  → on failure: generation_error, refund, release Redis lock

Client → GET /api/listings/status?jobId= (poll until completed | failed)
```

**Exceptions:** `isDraft: true` (instant preview) stays **synchronous** on the producer route.

### Key modules

| Module | Role |
|--------|------|
| `src/lib/listing/context-gateway.ts` | `stampAndCompileListingContext()` — atomic keyword stamp + step-scoped signal compile |
| `src/lib/listing/sync-queue-hash.ts` | Sets `workspace_keywords.queue_hash` for staged rows |
| `src/lib/listing/generation-queue-hash-lock.ts` | Upstash Redis `SET NX` — one in-flight pipeline per queue hash |
| `src/lib/listing/modular-phase-guard.ts` | `checkModularPhaseOrder()` (read) vs `assertModularPhaseOrder()` (execute) |
| `src/lib/listing/modular-pipeline-state-machine.ts` | Pipeline step state transitions |
| `src/lib/listing/listing-generation-executor.ts` | Worker job runner |
| `src/lib/qstash/publish-listing-generation.ts` | Enqueue to Upstash QStash |
| `src/lib/db/listing-generation-job.ts` | Draft row job lifecycle (`pending` → `processing` → `completed` \| `failed`) |

### Phase guard semantics

- **Producer (`executionMode: "read"`):** `checkModularPhaseOrder()` returns `{ ok: false, code: "WAITING_FOR_PHASES" }` when prerequisite draft phases are not persisted — HTTP **202**, not 500.
- **Worker (`executionMode: "execute"`):** `assertModularPhaseOrder()` throws `modular_phase_order_conflict` for internal consistency.
- **Pipeline entry:** Individual `title`/`short`/`long` without `pipeline` or `isRegenerate` → `409 modular_pipeline_required`.

### Environment

| Variable | Purpose |
|----------|---------|
| `QSTASH_TOKEN` | Publish async jobs |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | Verify worker callbacks |
| `QSTASH_CALLBACK_URL` or `NEXT_PUBLIC_APP_URL` | Worker URL target |
| `INTERNAL_WORKER_SECRET` | Local dev worker invoke without QStash |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Queue-hash locks |

See `docs/api.md` for request/response contracts and `docs/database.md` for `workspace_listing_drafts` job columns.

---

## Context gateway (keyword stamping)

Before generation, the **Context Gateway** binds staged Keyword Tracker rows to the active optimization queue hash and compiles step-scoped signals.

1. **`syncQueueHash`** — `UPDATE workspace_keywords SET queue_hash = … WHERE workspace_id, app_id, is_staged`.
2. **`stampAndCompileListingContext`** — atomic stamp + `compileContextForStep()` for the requested `generationStep`.
3. **Gate:** Zero staged keywords → `400 KEYWORD_CONTEXT_REQUIRED` (no blind generation).

**Step-scoped context:**
- Title / short: top 5 keywords
- Long / full / finalize: top 5 keywords + 2 competitor signals

Index: `workspace_keywords_queue_hash_idx` on `queue_hash` (migration `20260622150000`).

Vault integration unchanged: Active Context still reads **only** `features.optimization_queue`; the gateway reads `workspace_keywords` + queue synthesis, not raw discovery namespaces.

---

## Billing observability (Session 5)

### Granular phase telemetry

Table `listing_generation_costs` logs per-phase token and credit usage after each Gemini phase in the worker. Aggregated by `GET /api/billing/usage-breakdown` (title / short / long / full bars in Settings billing dashboard).

### Monthly credit cap

`workspaces.monthly_credit_cap` (nullable) — user-defined budget. `evaluate-credit-budget-alert.ts` fires `credit_budget_warning` at 80% of cap. UI in Settings → Integrations & Alerts via `updateBudgetCap()`.

### Ranking impact

`GET /api/workspaces/:id/keywords/ranking-impact` — average `recent_rank_gain` over 7-day window; displayed as chip in credit dashboard.

---

## Implemented: workspace wallet + ledger (listing AI)

- **Table:** `credits_ledger` (append-only; negative `amount` = spend, positive = refund/top-up).
- **RPCs:** `consume_workspace_ai_credits` (member + balance check, row lock, debit + ledger row) and `refund_workspace_ai_credits` (reverses a spend; idempotent via `already_refunded`). Modular regenerates use `consume_modular_listing_regenerate` (trial slots 0–2 free, then 1 credit).
- **Modular pipeline billing (Session 4–5):** Pipeline, full, and finalize steps debit **post-success** in the worker after orchestrator + Zod validation succeed; refunds on hard worker failure. Regenerate steps use trial slot or 1 credit post-success.
- **API:** `POST /api/listings/generate` (producer — validates, enqueues, or sync draft), `POST /api/listings/worker` (consumer), `GET /api/listings/status`. Legacy routes `POST /api/listings/optimizer-autofill` and `POST /api/apps/suggest` still debit before provider call. Keyword Tracker Serper preview/refresh uses debit-before, refund-on-failure.
- **Costs:** `lib/features/billing/credit-costs.ts` — `listing_generation` = **5** credits; `modular_listing_regenerate` = **1** credit (after trial slots); `listing_optimizer_autofill` = **3**; `serper_preview_per_country` = **1**; `reviews_ai_reply` = **1**.
- **Telemetry:** `listing_generation_costs` table + `GET /api/billing/usage-breakdown` for per-phase aggregates (Settings dashboard).

### AI Image Engine (Runware Integration)
- **Endpoint:** `https://api.runware.ai/v1`
- **Model:** Flux.1 (Dev or Schnell) or Stable Diffusion XL.
- **Workflow:** 
  1. Frontend sends a "Logo Prompt" to a Next.js Server Action.
  2. Server Action calls Runware via WebSocket or REST.
  3. Runware returns a CDN URL for the generated icon.
  4. The URL is passed to the `LivePreview` component.
