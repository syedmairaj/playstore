# IMPLEMENTATION_STATUS.md

> **Product:** Growth Hub — ASO SaaS for Google Play  
> **Stack:** Next.js 15 · React 19 · Supabase · Gemini · QStash · Upstash Redis · Stripe · Vercel  
> **Last updated:** 2026-07-01  
> **Rule:** This file reflects current implementation reality — update it every session.

---

## 1. Completed Features

### Core Platform
- [x] Auth (Supabase email/password, OAuth) — login, signup, callback, signout
- [x] Workspaces — create, update, delete, owner transfers, `create_new_workspace` RPC
- [x] Team invitations — invite by email, workspace member management
- [x] Onboarding — multi-step flow, `onboarding_complete` flag
- [x] Profile — user profile, notification preferences
- [x] App management — add/update apps per workspace, icon upload, country targets
- [x] Feature flags — DB-backed + `NEXT_PUBLIC_FF_*` env overrides
- [x] Admin panel — user account status, financial export, AI COGS leaderboard, plan margins
- [x] i18n — next-intl wired; `en.json` + `ar.json` full namespace coverage for all main surfaces

### Keyword Tracker
- [x] Add/delete tracked keywords
- [x] Manual rank snapshot entry
- [x] Bulk add from AI listing generation output
- [x] Live rank (Serper Play Store SERP) — credit-gated, point-in-time
- [x] Serper preview draft — per-user staging before committing to vault
- [x] Rank history per keyword
- [x] Ranking-impact summary (7-day avg gain) for billing dashboard
- [x] Keyword validator — heuristic viability scoring (embedded slide-over)
- [x] Staging vault keyword write — from validator result

### Competitor Spy
- [x] Add/delete competitor analyses (scraper-backed)
- [x] Competitor keyword surfaces
- [x] Custom competitor keyword override
- [x] Sentiment analysis (Vertex AI) on competitor review insights
- [x] Competitor strength audit queue

### Reviews
- [x] Play Store review sync (google-play-scraper)
- [x] AI review analysis + caching
- [x] AI draft reply (1 credit)
- [x] Publish reply to Play Store (skips gracefully without OAuth)
- [x] Stage review issue → listing backlog
- [x] Pending insights — adopt / dismiss
- [x] Archive from active context, restore backlog
- [x] Review-derived optimization queue signals

### ASO Listing Generation (Modular Async Pipeline)
- [x] Async QStash producer/worker — `POST /api/listings/generate` → 202 + `jobId`
- [x] Worker (`/api/listings/worker`) — orchestrator execution + post-success credit debit
- [x] Job status polling (`/api/listings/status`) — `force-dynamic`, `no-store` headers
- [x] Modular steps: `title`, `short`, `long`, `finalize`, `pipeline`, `captions`
- [x] Instant draft path (sync fallback)
- [x] Context gateway — keyword signal stamping, `queueHash` deduplication
- [x] Redis queue-hash lock — prevents duplicate in-flight jobs
- [x] Draft persistence — `workspace_listing_drafts` upsert by `queueHash`
- [x] Phase progress tracking — `persisted_phases`, `pipeline_progress`
- [x] Modular long description — granular generation + assembler + defensive fallback
- [x] Signal context — brandKit, marketIntel, reviews, keywordTracker, competitorSignals injected into Gemini prompt
- [x] Screenshot captions step — 7 captions per locale, tone-derived from long description
- [x] `generate-from-insights` — listing from review/competitor intel
- [x] `market-capture` listing generation
- [x] Optimizer autofill — single-field AI fill (3 credits)
- [x] Dead-letter queue (`listing_dlq`) for failed/zombie jobs
- [x] Phase cost telemetry — `listing_generation_costs` per step

### Listing Versions & Deployment View
- [x] `listing_versions` table — draft → published → deployed lifecycle
- [x] Create / list / single-version API
- [x] Status transitions — publish, deploy, revert to draft
- [x] Live listing snapshot for side-by-side Deployment View comparison
- [x] Update captions on existing version
- [x] Version notes
- [x] DeploymentView UI component — side-by-side diff
- [x] VersionHistoryPanel UI component

### Play Store Performance Attribution
- [x] `listing_performance` table — daily funnel metrics (impressions, store visits, installers, CVR)
- [x] `listing_version_signal_snapshots` — GenerationSignalContext persisted per job
- [x] `listing_version_metrics` — aggregated daily metrics per version
- [x] Performance attribution API (`GET /performance-attribution`) — signal efficacy rows
- [x] Signal Efficacy Score — `(ΔCVR) / signals_used`
- [x] Performance attribution dashboard component — expandable rows, CVR delta, efficacy tier badges
- [x] Performance Attribution page mounted — `/app/[workspaceId]/performance-attribution` route, sidebar nav item, EN/AR i18n
- [x] Daily cron ingestion (`/api/cron/ingest-play-metrics`) — GCS acquisition CSV → upsert
- [x] Google Play GCS CSV parser — fuzzy header matching, bigint-safe, aggregates by country

### Runware Visual / Screenshot Studio
- [x] `generateRunwareVisualPrompt` — brand-consistent prompt from brandKit.style + palette
  - Always includes: `high contrast, clean background, cinematic lighting`
  - Exact format: `brand color #{brandColor}, secondary color #{palette[0]}`
- [x] `generateRunwarePromptBatch` — one payload per caption, sorted by carousel order
- [x] RTL layout modifiers for Arabic locale
- [x] `runwarePrompt` embedded into each `ScreenshotCaption` — **persisted to JSONB** for CVR correlation
- [x] `uiFocus` field on `ScreenshotCaption` — Gemini-generated background context
- [x] Screenshot Studio — async job, slide render, Gemini captions endpoint
- [x] Logo generation endpoint — Runware app icon batch
- [x] Banner generation — Runware feature graphic batch

### Brand Assets & Brand Kit
- [x] Brand assets vault — upload (signed URL), list, delete
- [x] Brand kit sync — kit → mockup / asset manifest
- [x] Visual asset manifest — `workspace_asset_manifest`, manual override
- [x] Theme overrides per workspace

### Billing & Credits
- [x] Credits ledger — debits, refunds, balance reads
- [x] `consume_workspace_ai_credits` RPC — atomic debit
- [x] Modular regenerate billing — 3 trial regenerates per workspace + credit path
- [x] Post-success worker debit (credits only charged on successful generation)
- [x] Monthly credit budget cap — `workspace_monthly_credit_cap`, 80% alert trigger
- [x] Stripe webhooks — subscription lifecycle
- [x] Credit top-up (credit packs)
- [x] Prorated plan upgrade
- [x] Credit dashboard — phase breakdown chart, usage aggregates
- [x] Per-phase cost telemetry for admin COGS analysis

### Optimization Queue & Staging Vault
- [x] `workspace_staging_vault` — universal `state_en`/`state_ar` JSONB per app
- [x] VaultCore — centralized vault writes (keyword, competitor, review, brand signals)
- [x] Optimization queue — curated ASO items, SSOT for listing generation context
- [x] Active context synthesis — queue → signal context compilation
- [x] Context package store — Redis-cached compressed context for generation
- [x] Signal lifecycle status — tracking signal state through pipeline
- [x] Staging vault list/get/add/delete/archive/restore API

### Market Intelligence
- [x] Top charts cache
- [x] Keyword spotlight / market UX
- [x] ASO report cards

### Google Play Integration
- [x] OAuth2 connect/disconnect/callback/status
- [x] Refresh token encryption (AES-256-GCM, key from hex, tag+IV as base64)
- [x] Access token resolver for workspace
- [x] Publish listing to Play Console
- [x] Publish reply to Play Store
- [x] Service account auth for GCS/reporting

### Ops / Infra
- [x] Vercel cron — cleanup (03:00), ingest-play-metrics (06:00)
- [x] `ops_config` DB table — zombie timeout, tunable params
- [x] Nightly cleanup job
- [x] Sentry error monitoring (optional, gated by `SENTRY_DSN`)
- [x] `scripts/decrypt-token.mjs` — standalone AES-256-GCM token decryptor

---

## 2. In Progress Features

### i18n Dashboard Parity
- **Status:** All key namespaces exist in `ar.json` but most dashboard optimizer UI is English-hardcoded inline
- **Gap:** Many string literals in `ListingOptimizer.tsx`, `modular-listing-panel.tsx`, `deployment-view.tsx` not using `useTranslations()`
- **Next:** Audit and replace hardcoded strings in core optimizer surfaces

### Listing Version — Deployment View Polish
- **Status:** Core component built; version history panel exists
- **Gap:** Version comparison diff view is minimal — no field-level diff highlighting
- **Gap:** "Deploy to Play Store" button wires through `publish-listing-to-play-store.ts` but full E2E flow needs validation with live Google credentials

### Performance Attribution Dashboard Integration
- **Status:** API + table component built and wired
- **Gap:** Not yet mounted in the main dashboard tab layout (Settings / sidebar)
- **Gap:** `listing_version_metrics` aggregation function (`areMetricsStale`) tested but ingestion E2E not validated in production

### Keyword Validator Volume Data
- **Status:** Heuristic scoring only (competition/length/specificity heuristics)
- **Gap:** No real search volume API connected — `estimatedVolume` is a heuristic estimate
- **Note:** This is a known limitation; placeholder for a future data partner

### Streaming / Progressive LLM Output
- **Status:** Modular polling returns full step results; partial field reveal on partial-status works
- **Gap:** True streaming (SSE/token-by-token) from Gemini to frontend not implemented — pipeline uses request/response cycle
- **Gap:** `useListingPipeline.ts` polls every 2s; no WebSocket or SSE path exists yet

---

## 3. Pending Features

### Producer Registry Pattern
- `src/lib/producers/` has stubs for `keyword-validator`, `competitor-spy`, `review-analysis`, `experiment-snapshots` producers
- **None are functional** — vault writes go through VaultCore directly
- Planned for: decoupled background processing of non-listing AI jobs

### Live Rank History Chart
- Keyword rank history is stored per snapshot in `keyword_rank_snapshots`
- No chart component built for the validator UI to show rank trend over time
- Existing `keyword-watchlist-table.tsx` shows latest rank only

### Localized Listings (ae / in / mx)
- DB table `workspace_localized_listings` exists with `/api/workspaces/[workspaceId]/listings/localize`
- No UI component built for managing localized variants
- Generation endpoint exists but frontend is missing

### A/B Experiment Snapshots
- `workspace_experiments` + `/api/workspaces/[workspaceId]/experiments/snapshots` endpoint exists
- No frontend UI built — experiments page stub exists in dashboard but empty

### Growth Stubs (Dashboard)
- `/app/[workspaceId]/growth` — page exists but content is placeholder
- ASO report card UI — backend built, no front-end display component

### Alerts System
- `workspace_alerts` table + scan + read/mark API complete
- Alert display in dashboard shell exists (`usePageData`) but AlertCenter UI is minimal

### Backlog / Issue Tracking UI
- `workspace_listing_backlog` fully operational with review staging
- Dedicated backlog management view not built (issues visible inline in Reviews tab only)

### Screenshot Studio → Listing Pipeline Integration
- Screenshot studio generates slide assets via Runware
- `runwarePrompt` is now persisted on captions JSONB but no UI connects "use this Runware image" to a version's visual assets

---

## 4. All Changes (Recent Sessions)

### Session 7 — Runware Brand-Consistent Screenshots (2026-06-29)
- Extended `ScreenshotCaption` type with `uiFocus` (Gemini background context) and `runwarePrompt` (persisted to JSONB)
- Updated `LISTING_CAPTIONS_SCHEMA` to capture `uiFocus` from Gemini output
- Fixed `buildColorDirectives` to exact spec format: `brand color #{hex}, secondary color #{hex}`
- Added universal markers: `high contrast, clean background, cinematic lighting` to all style variants
- `buildSceneDescriptionForCaption` now uses `caption.uiFocus` when available (falls back to theme template)
- Orchestrator embeds `runwarePrompt` onto each caption before returning — prompts now persisted to `listing_versions.screenshot_captions` JSONB for CVR correlation
- `CaptionsStepData.runwarePayloads` retained for frontend Runware API submission

### Session 6 — Performance Attribution + Ingestion Engine (2026-06-27/28)
- New tables: `listing_performance`, `listing_version_signal_snapshots`, `listing_version_metrics`
- `listing_versions` lifecycle — draft → published → deployed
- `listing-performance-ingestion.ts` — ETL pipeline from GCS acquisition CSVs
- `google-play-auth.ts` — dedicated OAuth2 service account JWT auth with in-process token cache
- `play-store-acquisition-api.ts` — robust GCS CSV fetch + parser (fuzzy headers, bigint-safe)
- `signal-efficacy.ts` — Signal Efficacy Score, efficacy tier classification
- `performance-attribution-table.tsx` — dashboard component
- `/api/cron/ingest-play-metrics` + `vercel.json` cron schedule
- Fixed PostgreSQL `CAST(COUNT(*) FILTER(...) AS integer)` syntax error in migration
- `listing-generation-executor.ts` — fire-and-forget signal snapshot persist on job completion
- `docs/database.md` updated

### Session 5 — Modular Pipeline Hardening (2026-06-21/22)
- Async QStash producer/worker, Redis queue-hash lock
- Context gateway — keyword stamping, `queueHash` deduplication
- Modular billing — trial regenerates (3 free), post-success debit
- `workspace_listing_drafts` — draft persistence by `queueHash`
- Phase cost telemetry — `listing_generation_costs`
- Monthly credit cap + 80% alert
- Dead-letter queue (`listing_dlq`)
- `ops_config` tunable params table
- `workspace_asset_manifest` — visual manifest with manual override

### Session 4 — Signal Context + Brand Kit (2026-06)
- `GenerationSignalContext` — brandKit, marketIntel, reviews, keywordTracker, competitorSignals injected
- `generateRunwareVisualPrompt` — brand-consistent visual prompt generation
- `generateListingPipelineCaptions` accepts `brandKit` parameter
- Modular listing prompt enriched with brand/competitor/review signals

### Sessions 1–3 — MVP Foundation (2025–2026)
- Auth, workspaces, keywords, competitor spy, reviews
- Listing optimizer (sync path)
- Billing wallet, Stripe integration
- Optimization queue + VaultCore
- Screenshot studio, brand assets
- Market intelligence, top charts

---

## 5. Known Bugs / Issues

| # | Severity | Area | Description | Status |
|---|----------|------|-------------|--------|
| 1 | Medium | Build | `PGRST116_FINAL_FIX.ts` in root — SQL patch file picked up as TypeScript by `tsc`, generates parse errors | Pre-existing; does not block build (Next.js ignores it) |
| 2 | Medium | Build | `src/components/staging/StagingButtonTestHarness.tsx` — malformed JSX, multiple TS errors | Pre-existing test artifact; not imported in production |
| 3 | Low | i18n | Most dashboard optimizer UI has hardcoded English strings inline — not using `useTranslations()` | Known; Arabic users see EN text in optimizer |
| 4 | Low | Arch | Dual `lib/` + `src/lib/` duplication — both have `google-play-oauth.ts`, `generate-screenshot-layout.ts` etc. | Technical debt; gradual migration to `src/lib/` |
| 5 | Low | Perf | `workspace_staging_vault` JSONB (`state_en`/`state_ar`) can grow unbounded per app; mitigated by queue cap of 50 items and dropped btree indexes | Monitor in production |
| 6 | Low | Data | Keyword `estimatedVolume` is a heuristic — not real search volume data | By design; no data provider connected |
| 7 | Low | Auth | `publish-play-store-reply.ts` returns `{ result: "skipped" }` silently when Google service account credentials are missing — no user-visible error | Intentional for workspaces without Play integration |
| 8 | Info | Dev | `src/debug-token.ts`, `src/test-ingestion.ts` — debug/test scripts committed to repo | Dev artifacts; not included in production bundle |

---

## 6. API Status

### ✅ Complete & Stable

| Endpoint | Method(s) |
|----------|-----------|
| `/api/workspaces` | GET, POST |
| `/api/workspaces/[workspaceId]` | PATCH, DELETE |
| `/api/workspaces/[workspaceId]/apps` | GET, POST |
| `/api/workspaces/[workspaceId]/apps/[appId]` | PATCH |
| `/api/workspaces/[workspaceId]/keywords` | GET, POST |
| `/api/workspaces/[workspaceId]/keywords/[keywordId]` | GET, DELETE |
| `/api/workspaces/[workspaceId]/keywords/bulk` | POST |
| `/api/workspaces/[workspaceId]/keywords/[keywordId]/ranks` | POST |
| `/api/workspaces/[workspaceId]/keywords/[keywordId]/serper-refresh` | POST |
| `/api/workspaces/[workspaceId]/keywords/serper-save` | POST |
| `/api/workspaces/[workspaceId]/validator/validate-keyword` | POST |
| `/api/workspaces/[workspaceId]/validator/live-rank` | POST |
| `/api/workspaces/[workspaceId]/competitors` | GET, POST |
| `/api/workspaces/[workspaceId]/competitors/[competitorId]` | DELETE |
| `/api/workspaces/[workspaceId]/reviews/sync` | GET, POST |
| `/api/workspaces/[workspaceId]/reviews/analyze` | GET, POST |
| `/api/listings/generate` | POST, PATCH |
| `/api/listings/worker` | POST |
| `/api/listings/status` | GET |
| `/api/listings/draft` | GET |
| `/api/listings/optimizer-autofill` | POST |
| `/api/workspaces/[workspaceId]/optimization-queue` | GET, POST |
| `/api/workspaces/[workspaceId]/staging/add` | POST |
| `/api/workspaces/[workspaceId]/staging/vault` | GET, POST |
| `/api/workspaces/[workspaceId]/listing-versions` | GET, POST |
| `/api/workspaces/[workspaceId]/listing-versions/[versionId]` | GET, PATCH |
| `/api/workspaces/[workspaceId]/performance-attribution` | GET, PATCH |
| `/api/cron/ingest-play-metrics` | POST |
| `/api/cron/cleanup` | POST |
| `/api/billing/stripe/webhook` | POST |
| `/api/workspaces/[workspaceId]/billing/usage-summary` | GET |
| `/api/workspaces/[workspaceId]/credits-ledger` | GET |
| `/api/integrations/google-play/connect` | GET, DELETE |
| `/api/integrations/google-play/callback` | GET |
| `/api/integrations/google-play/status` | GET |
| `/api/screenshot-studio/generate` | POST |
| `/api/brand-assets/vault` | GET |
| `/api/brand-assets/upload-url` | POST |

### ⚠️ Partial / Needs Validation

| Endpoint | Issue |
|----------|-------|
| `/api/workspaces/[workspaceId]/apps/[appId]/publish-listing` | Works when service account credentials present; silently skips otherwise. E2E with live Play Console not validated |
| `/api/workspaces/[workspaceId]/performance-attribution` | API built; not mounted in dashboard tab navigation yet |
| `/api/workspaces/[workspaceId]/apps/[appId]/attribution` | Attribution summary route exists; wiring to UI incomplete |
| `/api/listings/pipeline-status` | Returns intel module readiness; some module states always return `not_ready` if vault empty |
| `/api/workspaces/[workspaceId]/keywords/ranking-impact` | Returns data; not displayed outside credit dashboard |
| `/api/workspaces/[workspaceId]/billing/prorated-upgrade` | GET proration + POST purchase; Stripe test mode only |

### ❌ Missing / Stub

| Endpoint | Status |
|----------|--------|
| `/api/workspaces/[workspaceId]/experiments/snapshots` | DB + API exist; no frontend UI |
| `/api/workspaces/[workspaceId]/listings/localize` | DB + API exist; no UI for managing localized copies |
| `/api/workspaces/[workspaceId]/growth/*` | Page stub only; no endpoints defined |

---

## 7. Database Status

### ✅ Tables Created & Stable (66 migrations applied)

| Table | Status |
|-------|--------|
| `profiles`, `workspaces`, `workspace_members` | Production |
| `apps`, `keywords`, `keyword_rank_snapshots` | Production |
| `listing_generations`, `usage_logs`, `rate_limit_buckets` | Production |
| `credits_ledger`, `workspace_ai_credits` | Production |
| `workspace_staging_vault` | Production (universal `state_en`/`state_ar` schema) |
| `workspace_keywords` | Production (with `queue_hash`, `context_gateway`) |
| `workspace_competitor_analyses`, `competitor_insights` | Production |
| `workspace_listing_improvements`, `workspace_listing_backlog` | Production |
| `workspace_listing_drafts` | Production (`persisted_phases`, job status) |
| `listing_generation_costs` | Production (phase cost telemetry) |
| `listing_dlq` | Production (dead-letter queue) |
| `listing_versions` | Session 6 — production |
| `listing_performance` | Session 6 — production |
| `listing_version_signal_snapshots` | Session 6 — production |
| `listing_version_metrics` | Session 6 — production |
| `workspace_monthly_credit_cap` | Production |
| `ops_config` | Production |
| `screenshot_jobs` | Production |
| `brand_assets_vault`, `workspace_asset_manifest` | Production |
| `workspace_theme_overrides` | Production |
| `aso_reports` | Production (no UI) |
| `market_top_charts_cache` | Production |
| `review_pending_insights` | Production |
| `feature_flags` | Production |
| `admin_ai_transaction_logs` | Production |
| `workspace_trial_regenerations` | Production |
| `workspace_localized_listings` | Production (no UI) |

### ⚠️ Schema Notes

- `listing_versions.screenshot_captions` JSONB — now stores `{ order, caption, theme, uiFocus?, runwarePrompt? }` per item. No DDL migration needed (JSONB is additive).
- `workspace_staging_vault` JSONB cols (`state_en`, `state_ar`) have no btree indexes (dropped in `20260612100000`). GIN indexes may be needed if JSONB query volume grows.
- `listing_performance` uses `bigint` for `impressions`/`installers` — Supabase JS driver returns these as strings; handle with `parseInt()` on client.

### ❌ Missing Migrations

None currently pending. All Session 7 changes (`uiFocus`, `runwarePrompt` on `ScreenshotCaption`) are additive to existing JSONB columns — no migration required.

---

## 8. Shopify Integration Status

**Not applicable.** This project has no Shopify integration. It is a Google Play / Android app store optimization platform.

- Play Store integration: see Google Play Integration section above
- Stripe is used for SaaS billing (not e-commerce)

---

## 9. AI Features Status

### ✅ Working in Production

| Feature | Model | Credits |
|---------|-------|---------|
| Listing generation — title step | Gemini 2.5 Flash | Billed |
| Listing generation — short description | Gemini 2.5 Flash | Billed |
| Listing generation — long description (granular) | Gemini 2.5 Flash | Billed |
| Listing generation — finalize/extras | Gemini 2.5 Flash | Billed |
| Screenshot captions (7 per locale) | Gemini 2.5 Flash | Free step |
| Listing autofill (single field) | Gemini 2.5 Flash | 3 credits |
| App name / short description suggest | Gemini 2.5 Flash | 3 credits |
| Market capture listing | Gemini 2.5 Flash | Billed |
| Insights-based listing | Gemini 2.5 Flash | Billed |
| Review analysis | Vertex AI (Gemini) | Billed |
| Review draft reply | Vertex AI (Gemini) | 1 credit |
| Competitor sentiment | Vertex AI | Billed |
| AI response (generic) | Vertex AI / Gemini | Billed |
| App icon generation | Runware | Billed |
| Feature graphic / banner | Runware | Billed |
| Screenshot slide render | Runware | Billed |
| Runware visual prompt — brand-consistent | Client-side (no API) | Free |

### ⚠️ Experimental / Partial

| Feature | Status |
|---------|--------|
| `uiFocus` on screenshot captions | Schema + parser added; depends on Gemini returning the field — not 100% guaranteed with current structured output config |
| Signal Efficacy Score (CVR / signals) | Calculation correct; accuracy depends on GCS CSV ingestion completing — not meaningful until production Play Console connected |
| `generate-screenshot-layout.ts` (Gemini layout assist) | File exists in both `lib/` and `src/lib/`; used by screenshot studio; not wired into main listing pipeline |

### ❌ Not Implemented

| Feature | Notes |
|---------|-------|
| Streaming Gemini output (SSE/token-by-token) | Polling only; client sees full step result at once |
| Real keyword search volume | Heuristic only; no data provider API connected |
| Play Store ranking API | No official API exists; heuristic + Serper only |
| GPT-4 / Claude fallback | Single model path (Gemini); no multi-model fallback |

---

## 10. Next Immediate Tasks

These are ordered by impact. Tackle in sequence.

### P0 — Fix Before Next User-Facing Release

- [x] **Mount Performance Attribution tab** — New route `/performance-attribution` created; nav item added to workspace layout (gated with `listing_optimizer` flag); i18n keys added to EN/AR; `PerformanceAttributionTable` rendered via server component page (2026-07-02)
- [ ] **Validate `uiFocus` from Gemini** — Run a test generation and confirm Gemini actually returns `uiFocus` in the JSON. If structured output enforcement strips it, add `uiFocus` to the `required` array in `LISTING_CAPTIONS_SCHEMA`
- [ ] **Fix dual `lib/` duplication** — `lib/play-store/google-play-oauth.ts` and `src/lib/play-store/google-play-oauth.ts` are identical; delete the root `lib/` copy and update all imports to `@/lib/play-store/google-play-oauth`

### P1 — Core UX Gaps

- [ ] **i18n audit — optimizer surfaces** — Replace hardcoded English strings in `ListingOptimizer.tsx`, `modular-listing-panel.tsx`, `deployment-view.tsx`, `version-history-panel.tsx` with `useTranslations()` calls. Arabic users currently see EN in these surfaces
- [ ] **Deployment View — Play Store publish E2E** — Test `apps/[appId]/publish-listing` with a real Google service account. Confirm `publish-listing-to-play-store.ts` handles both `title`/`short_description` and `long_description` fields per locale
- [ ] **Keyword rank history chart** — Build a small line chart in the keyword tracker using existing `keyword_rank_snapshots` data. The data is there; there's just no visualization component

### P2 — Feature Completion

- [ ] **Localized listings UI** — Build the management component for `workspace_localized_listings` (ae/in/mx). API endpoint already exists at `/api/workspaces/[workspaceId]/listings/localize`
- [ ] **Backlog management view** — Build a standalone backlog panel showing all `workspace_listing_backlog` issues (currently only visible inline in Reviews)
- [ ] **Alerts center** — Build a proper alert notification center in the dashboard shell using `workspace_alerts` (data layer complete; display is minimal)
- [ ] **A/B snapshot UI** — Build the experiment snapshots page under `/app/[workspaceId]/growth`; DB table and API are ready

### P3 — Technical Debt

- [ ] **Remove `src/debug-token.ts` and `src/test-ingestion.ts`** — dev artifacts should not be in `src/`; move to `scripts/` or delete
- [ ] **Delete `PGRST116_FINAL_FIX.ts`** from project root — it's a SQL comment masquerading as a `.ts` file and causes `tsc` parse errors
- [ ] **Delete `StagingButtonTestHarness.tsx`** or fix its JSX — it generates ~20 TS errors on every `tsc --noEmit` run, masking real issues
- [ ] **Decide on producer registry** — either implement `keyword-validator.producer.ts` properly or delete the stubs in `src/lib/producers/`; leaving dead stubs increases maintenance surface

---

*Generated from codebase analysis on 2026-07-01. Update this file at the start of each development session.*
