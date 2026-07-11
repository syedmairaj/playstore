# IMPLEMENTATION_STATUS.md

> **Product:** playstore.xyz (Growth Hub) — B2B ASO SaaS for Google Play  
> **Stack:** Next.js 15 · React 19 · Supabase · Gemini (Vertex) · QStash · Upstash Redis · Stripe · Vercel  
> **Last updated:** 2026-07-11  
> **Branch context:** `feature/hardened-listing-pipeline`  
> **Rule:** This file reflects current implementation reality — update it every session.

**Related:** [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) · [`STAGING_VAULT_INTEGRATION_SUMMARY.md`](./STAGING_VAULT_INTEGRATION_SUMMARY.md)

---

## 0. Current Status Snapshot (July 11, 2026)

| Area | Status |
|------|--------|
| **Core platform** | 🟢 Production — auth, workspaces, billing, i18n shell |
| **Listing Optimizer** | 🟢 Growth Orchestrator; per-app ASO isolation; refresh-safe wizard |
| **Keyword / Competitor / Reviews** | 🟢 Operational; `WorkspaceAppContext` cross-module app sync |
| **Performance Attribution** | 🟡 API + page mounted; GCS ingest needs prod credentials |
| **Play Console publish** | 🟡 Works with service account; E2E not fully validated |
| **Market differentiation** | 🟡 Analyst + ROI + tone A/B + guided growth path |

**Positioning shift (July 2026):** playstore.xyz is no longer “AI listing copy” alone — it is a **Performance Analyst** platform: vault signals → competitive gap metadata → ROI keyword intelligence → deploy + attribution loop.

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
- [x] Modular steps: `title`, `short`, `long`, `finalize`, `pipeline`, `captions`, **`full` (sync unlock)**
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

### B2B Performance Analyst & ROI Intelligence (July 2026) — **NEW**
- [x] `buildPerformanceAnalystSystemXml()` — competitive gap + ROI standards prepended to listing prompts
- [x] `listing-optimizer-v16.0` — performance-first JSON contract (gap keywords, strategicRationale, listingVariants)
- [x] `enrichKeywordIntelligence()` — server-side ROI rows (searchVolume, difficultyScore, relevanceMatch, roiRationale)
- [x] `keyword-strategy-parse.ts` — shared `[competitive]` / `[intent]` / `[gap]` parser (server + client)
- [x] `KeywordStrategyPanel` — Vol / Diff / Rel metrics, Quick win badges, hover ROI rationale
- [x] `keywordIntelligence` schema + persist merge in `listing-output.ts`
- [x] Model **does not** emit `keywordIntelligence` (reduces MAX_TOKENS; enriched post-parse)
- [x] Compact `listingVariants.fullDescription` (≤1500 chars in prompt) — reduces JSON bloat

### Tone A/B Deploy Automation (July 2026) — **NEW**
- [x] `buildToneAbDeployPlan()` — Bold 50% (aggressive) vs Professional 50% (growth) when gap keywords dominate
- [x] `ToneAbDeployPlanCard` — Play Console experiment steps + link to Performance Attribution
- [x] `MetadataVariantToggle` — **Bold · 50%** / **Professional · 50%** labels when plan active
- [x] Tests: `tone-ab-deploy-plan.test.ts`, `enrich-keyword-intelligence.test.ts`

### Listing Optimizer Hardening (July 2026) — **NEW**
- [x] Sync Full AI credit debit — user-scoped Supabase client (fixes 500 on unlock)
- [x] Regenerate spinner fix — `SYNC_LISTING_STEPS` runs all phases in-request on sync path
- [x] `WorkspaceCreditsContext` — nav credits refresh after billing
- [x] `resolveAuthenticatedUser()` — cookies + Bearer; fixes 401 on generate
- [x] `getSupabaseAuthHeaders()` on all listing generate clients
- [x] Client timeout **330s** + `tryRecoverListingAfterClientTimeout()` via `GET /api/listings/latest`
- [x] `clamp-play-store-title.ts` — word-boundary title clamp
- [x] `cta-suggestions-utils.ts` — “Why This Ranks” separated from install CTAs on export
- [x] XML caption prompts (`prompt-builder.ts`) + `enhance-listing-captions.ts`
- [x] Sync path creates `listing_versions` for Performance Attribution
- [x] `ListingHistory` — metrics tooltips / guide for Growth Tracking

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
- [x] **Tone badge per version** — joins `listing_generations.tone_style` via `source_generation_id` (July 2026)
- [x] **CPI monitoring legend** — UAC spend ÷ installers guidance in attribution table (July 2026)
- [x] Daily cron ingestion (`/api/cron/ingest-play-metrics`) — GCS acquisition CSV → upsert
- [x] Google Play GCS CSV parser — fuzzy header matching, bigint-safe, aggregates by country
- [x] `listing_snapshots` + `listing_metrics` — Growth Tracking in Listing Optimizer (weekly manual entry)

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

### Play Console Metrics Ingestion (Production)
- **Status:** Cron + GCS parser built; attribution table renders when data exists
- **Gap:** Requires `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` + `GOOGLE_PLAY_DEVELOPER_ACCOUNT_ID` in production
- **Gap:** Most workspaces see empty metrics until ingest runs or manual PATCH

### CPI / Paid Acquisition Loop
- **Status:** CPI formula documented in UI (UAC spend ÷ installers)
- **Gap:** No `cost_per_install` column in `listing_metrics` — manual spreadsheet workflow only
- **Gap:** No Google Ads / UAC API integration

### Real Keyword Search Volume
- **Status:** ROI panel shows tracker volume when available; else heuristics
- **Gap:** No AppTweak / data.ai / Sensor Tower API — limits enterprise credibility

### i18n Dashboard Parity
- **Status:** Performance Attribution + main nav i18n done; optimizer has mixed EN inline strings
- **Gap:** `ToneAbDeployPlanCard`, parts of `KeywordStrategyPanel` still English-only inline
- **Next:** Audit `ListingOptimizer.tsx` + new Session 6 components for `useTranslations()`

### Play Store Listing Experiments — One-Click Deploy
- **Status:** Tone A/B plan + export copy exists; user manually pastes into Play Console
- **Gap:** No Play Developer API experiment create/update — guidance only

### Streaming / Progressive LLM Output
- **Status:** Modular polling returns full step results
- **Gap:** No SSE/token streaming — long sync full unlock still 2–3 min perceived wait

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

### Session 9 — Sync Timeout & MAX_TOKENS Hardening (2026-07-07)
- `LISTING_GENERATION_TIMEOUT_MS` → **330_000** (was 180s — caused false timeouts at ~179s server completion)
- `tryRecoverListingAfterClientTimeout()` — salvages saved listing via `GET /api/listings/latest`
- `recoveredAfterTimeout` toast + i18n key
- Removed `keywordIntelligence` from Gemini `responseSchema` — server enrichment only
- Prompt: compact `listingVariants.fullDescription` (≤1500) to reduce output tokens
- Documented in `PROJECT_STATUS.md` Session 7

### Session 8 — B2B Performance Analyst + Tone A/B (2026-07-03–06)
- Performance Analyst XML prompts (`buildPerformanceAnalystSystemXml`)
- `enrich-keyword-intelligence.ts` + `keyword-strategy-parse.ts`
- `KeywordStrategyPanel` ROI metrics UI
- `tone-ab-deploy-plan.ts` + `ToneAbDeployPlanCard`
- Performance Attribution tone badge + CPI legend
- Listing optimizer hardening: auth 401, credits sync, regenerate spinner, title clamp, CTA export
- Tests: `enrich-keyword-intelligence.test.ts`, `tone-ab-deploy-plan.test.ts`, `listing-output-persist.test.ts`

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

## 5. Known Bugs / Open Issues

| # | Severity | Area | Description | Status |
|---|----------|------|-------------|--------|
| 1 | **High** | Listing gen | `finishReason: MAX_TOKENS` still possible on very large vault context — mitigated but not eliminated | Monitor; consider async-only for full unlock |
| 2 | **Medium** | UX | Sync full unlock takes **2–3 min** — no progressive UI beyond spinner | Streaming or phase reveal planned |
| 3 | **Medium** | Data | Keyword `searchVolume` / ROI metrics are **heuristic** unless Keyword Tracker has data | Needs data partner API |
| 4 | **Medium** | Attribution | GCS metrics ingest empty without Play service account in prod | Env config + E2E validation |
| 5 | **Medium** | Build | `PGRST116_FINAL_FIX.ts` in root — SQL patch picked up by `tsc` | Pre-existing; delete or move to `scripts/` |
| 6 | **Medium** | Build | `StagingButtonTestHarness.tsx` — malformed JSX, TS errors | Test artifact; delete or fix |
| 7 | **Low** | i18n | New Session 8 components partly English-inline | Audit ToneAbDeployPlanCard, keyword hints |
| 8 | **Low** | Arch | Dual `lib/` + `src/lib/` and `components/` + `src/components/` | Consolidate to `src/` |
| 9 | **Low** | Perf | `workspace_staging_vault` JSONB growth — mitigated by queue cap 50 | Monitor |
| 10 | **Low** | Auth | Play publish/reply silently skips without Google credentials | Needs clearer user messaging |
| 11 | **Info** | Dev | Verbose `[DEBUG]` logs in `generate/route.ts` | Gate behind `DEBUG_GEMINI` only |

### Recently Fixed (Session 8–9) ✅

| Bug | Fix |
|-----|-----|
| `listing_generation_client_timeout` despite POST 200 | 330s timeout + hydration recovery |
| Full AI 500 / credits not debited on sync unlock | User-scoped Supabase debit |
| Regenerate infinite spinner | `SYNC_LISTING_STEPS` in-request |
| Stale nav credits after unlock | `WorkspaceCreditsContext` |
| 401 on `POST /api/listings/generate` | `resolveAuthenticatedUser` + Bearer headers |
| Performance Attribution empty after sync | `listing_versions` on sync persist |
| Half-cooked Play Store title | Word-boundary clamp |
| “Why This Ranks” in CTA export | `cta-suggestions-utils` separation |
| Hardcoded secrets in repo history | Scrubbed + history rewrite (branch clean) |

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
| `/api/workspaces/[workspaceId]/performance-attribution` | GET + PATCH; tone join; page mounted at `/performance-attribution` |
| `/api/listings/latest` | GET — hydration + timeout recovery |
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
| `/api/workspaces/[workspaceId]/apps/[appId]/attribution` | Attribution summary route exists; wiring to UI incomplete |
| `/api/listings/pipeline-status` | Returns intel module readiness; some module states always return `not_ready` if vault empty |
| `/api/cron/ingest-play-metrics` | Built; needs prod Google credentials to populate attribution |
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
| Listing generation — full sync unlock | Gemini 2.5 Flash | Billed (5 credits) |
| Performance Analyst + ROI enrichment | Server post-process | Free (included in full gen) |
| Tone A/B deploy plan | Rule-based from gap keywords | Free |
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

| Real keyword search volume | Heuristic only; ROI panel needs data partner for enterprise sales |
| Play Store Listing Experiments API | Guidance only — no automated experiment create |
| CPI auto-tracking | Manual UAC ÷ installers; no Google Ads ingest |
| GPT-4 / Claude fallback | Single model path (Gemini); no multi-model fallback |

---

## 11. Market Uplift — Features to Differentiate playstore.xyz

These are **not yet built** but ranked by competitive impact for B2B ASO / MENA positioning.

### Tier 1 — High impact (revenue + retention)

| Feature | Why it wins | Effort |
|---------|-------------|--------|
| **Real search volume API** | Enterprise ASO buyers expect SV + difficulty from AppTweak/data.ai — unlocks agency tier | Medium (partner API) |
| **Closed-loop attribution** | Auto-ingest Play Console + optional Google Ads → show CPI/CVR by tone arm without manual entry | Medium (credentials + UI) |
| **Play Listing Experiments API** | One-click deploy Bold/Professional 50/50 from `ToneAbDeployPlanCard` — no copy-paste | High (Play API scope) |
| **Agency multi-workspace dashboard** | Portfolio view: all client apps, attribution deltas, white-label exports | Medium |
| **Keyword rank → listing ROI report** | “Keyword X improved #42→#12 after listing v3” — ties tracker to attribution | Medium |

### Tier 2 — Differentiation (vs copy-only ASO tools)

| Feature | Why it wins | Effort |
|---------|-------------|--------|
| **Niche-aware analyst templates** | Health / fintech / games prompt packs — “Performance Analyst for any vertical” | Low–Medium |
| **Competitor gap auto-queue** | Competitor Spy → auto-suggest gap keywords into optimization queue | Low |
| **MENA Arabic listing parity** | Full AR optimizer UI + localized market packs (ae/sa/eg) | Medium (i18n audit) |
| **Screenshot CVR correlation** | Show which Runware caption + visual drove install lift | Medium (needs metrics) |
| **Weekly ASO digest email** | Attribution + rank movement + recommended pivot — reduces churn | Low |

### Tier 3 — Growth & moat

| Feature | Why it wins | Effort |
|---------|-------------|--------|
| **Public ASO score API / embed** | Marketing wedge — “audit any Play URL” on playstore.xyz home | Medium |
| **Chrome extension** | Capture competitor listing + queue to vault from Play Store tab | High |
| **Apple App Store expansion** | Same vault → iOS metadata (larger TAM) | Very high |
| **API for CI/CD** | `POST /listings/generate` in release pipeline for indie studios | Medium |
| **Benchmark dataset** | Anonymous category CVR benchmarks (“your health app vs median”) | High (data) |

### Positioning statement (use in marketing)

> **playstore.xyz** is the only B2B Play ASO platform that turns your research vault into **ROI-ranked keyword intelligence**, **tone-tested deploy plans**, and **attribution-proven listing versions** — not just AI copy.

---

## 10. Next Immediate Tasks

These are ordered by impact. Tackle in sequence.

### P0 — Fix Before Next User-Facing Release

- [x] Mount Performance Attribution tab (2026-07-02)
- [x] Sync full unlock timeout + recovery (2026-07-07)
- [x] B2B Performance Analyst + ROI intelligence (2026-07-06)
- [ ] **Validate MAX_TOKENS under production load** — run 10 full unlocks with large vault; if >20% hit MAX_TOKENS, force async worker path for `generationStep: full`
- [ ] **Production Play metrics ingest** — configure GCS credentials; verify attribution table populates
- [ ] **Validate `uiFocus` from Gemini** — confirm structured output returns `uiFocus` on captions step

### P1 — Core UX Gaps

- [ ] **i18n audit — Session 8 components** — `ToneAbDeployPlanCard`, keyword panel hints, deploy plan copy → `messages/ar.json`
- [ ] **CPI field in Growth Tracking** — optional `cost_per_install` on `listing_metrics` weekly form
- [ ] **Deployment View — Play Store publish E2E** — live service account test
- [ ] **Keyword rank history chart** — visualize `keyword_rank_snapshots`

### P2 — Market Uplift (pick one per sprint)

- [ ] **Search volume data partner** — integrate one API; feed `enrichKeywordIntelligence` with real SV
- [ ] **Auto queue from Competitor Spy gaps** — one-click “Add gap keywords to optimizer”
- [ ] **Weekly ASO digest** — email from attribution + rank deltas
- [ ] **Localized listings UI** — ae/in/mx management surface
- [ ] **A/B snapshot UI** — experiment tracking under Growth hub

### P3 — Technical Debt

- [ ] Remove `src/debug-token.ts`, `src/test-ingestion.ts`, `PGRST116_FINAL_FIX.ts`
- [ ] Delete or fix `StagingButtonTestHarness.tsx`
- [ ] Consolidate `lib/` → `src/lib/` and `components/` → `src/components/`
- [ ] Gate verbose `[DEBUG]` logs in `generate/route.ts`
- [ ] Decide on producer registry stubs — implement or delete

---

*Generated from codebase analysis on 2026-07-07. Update this file at the start of each development session.*
