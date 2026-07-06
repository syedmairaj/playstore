# Growth Hub - Project Status & Architecture Reference

**Last Updated:** June 22, 2026  
**Project Phase:** Production - Active Development  
**Status:** 🟢 Stable with Active Enhancements  
**Session:** Post-session 5 (Async QStash listing pipeline, Context Gateway, granular billing, Settings billing UI)

> **Filename note:** Git tracks this file as `PROJECT_STATUS.md`. On case-insensitive filesystems (macOS default), `project_status.md` resolves to the **same file** — there is no separate copy. Use `PROJECT_STATUS.md` in links and tooling.

**Related docs:** [`STAGING_VAULT_INTEGRATION_SUMMARY.md`](./STAGING_VAULT_INTEGRATION_SUMMARY.md) · [`docs/architecture.md`](./docs/architecture.md) · [`docs/api.md`](./docs/api.md) · [`docs/database.md`](./docs/database.md)

---

## Executive Summary

Growth Hub is a **pro-grade ASO (App Store Optimization) platform** built on modern cloud-native architecture. The platform leverages a **Staged-State architecture** pattern for feature isolation, workspace-scoped data management, and zero-breaking-changes deployment strategy.

**Core Mission:** Enable indie app developers to optimize their Google Play Store listings through AI-powered keyword validation, experiment snapshots, and synthesis-driven improvements.

---

## Session 5 — Async Pipeline, Context Gateway & Billing Observability (June 22, 2026)

Quick handoff for new chat sessions. Vault + queue detail: `STAGING_VAULT_INTEGRATION_SUMMARY.md`. API contracts: `docs/api.md`.

### Architectural decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Producer / Worker split (Upstash QStash)** | `POST /api/listings/generate` validates + enqueues; `POST /api/listings/worker` runs Gemini orchestration. Avoids Vercel timeout on long pipelines. |
| 2 | **Orchestrator `executionMode`** | `read` on producer (phase check only, no Gemini/writes); `execute` on worker (full generation). |
| 3 | **`WAITING_FOR_PHASES` → 202** | Producer returns `{ code: "WAITING_FOR_PHASES", status: "pending" }` when prerequisite draft phases are not persisted — not 500/409. Client polls `jobId` when available. |
| 4 | **`checkModularPhaseOrder` vs `assertModularPhaseOrder`** | Read path returns a result object; execute path throws `modular_phase_order_conflict` (worker internal consistency). |
| 5 | **Context Gateway (`stampAndCompileListingContext`)** | Atomically stamps `workspace_keywords.queue_hash` for staged rows, then compiles step-scoped signals before generation. |
| 6 | **Redis queue-hash lock** | `SET NX` per `(workspaceId, queueHash)` blocks duplicate in-flight pipelines (300s TTL). Released in worker `finally`. |
| 7 | **Post-success billing (pipeline/full/finalize)** | Credits debited only after successful worker run; refunds on hard failure. |
| 8 | **Granular phase telemetry** | `listing_generation_costs` table + `GET /api/billing/usage-breakdown` for title/short/long/full credit + token aggregates. |
| 9 | **DB draft persistence** | `workspace_listing_drafts` keyed by `(workspace_id, queue_hash)` with `generation_status`, `job_id`, `current_phase`, EN/AR `vault_locale`. |
| 10 | **Monthly credit cap** | `workspaces.monthly_credit_cap` + `credit_budget_warning` alert at 80% usage (Integrations & Alerts settings). |
| 11 | **Settings billing UI** | Phase breakdown chart, ranking impact metric (`recent_rank_gain`), monthly credit cap input — EN/AR i18n. |

### Async listing generation flow

```
Client POST /api/listings/generate
  → auth, credits precheck, context gateway stamp+compile
  → orchestrator executionMode: "read" (phase guard)
  → if WAITING_FOR_PHASES → 202 (poll jobId if active)
  → acquire Redis lock (workspaceId, queueHash)
  → upsert workspace_listing_drafts (pending, job_id)
  → QStash publish → POST /api/listings/worker
  → 202 { jobId, status: "pending" }

Worker POST /api/listings/worker
  → verify QStash signature (or INTERNAL_WORKER_SECRET in dev)
  → executionMode: "execute" → runListingGenerationOrchestrator
  → serialized pipeline: title → short → long (ModularPhaseOrderGuard between steps)
  → post-success credit debit → generation_status: completed
  → on failure: generation_error, refund, release Redis lock
```

**Polling:** `GET /api/listings/status?jobId=` — `status`, `currentPhase`, `phases`, `result`.  
**Instant draft:** `isDraft: true` remains synchronous on the producer route (no queue).

### Context Gateway & keyword stamping

| Component | Role |
|-----------|------|
| `syncQueueHash` | Sets `workspace_keywords.queue_hash` for staged rows matching workspace + app + vault locale |
| `stampAndCompileListingContext` | Atomic stamp + `compileContextForStep()` before orchestrator |
| `workspace_keywords_queue_hash_idx` | B-tree index on `queue_hash` for fast compile lookups |
| Step-scoped context | Title/short: top 5 keywords; long/full/finalize: top 5 keywords + 2 competitor signals |

**Gate:** Zero staged keywords → `400 KEYWORD_CONTEXT_REQUIRED` (no blind generation).

### Phase orchestration (updated)

| Phase | Entry | Billing | Persistence |
|-------|-------|---------|-------------|
| Initial pipeline | `generationStep: pipeline` only (unless `isRegenerate`) | 5 credits post-success | Worker upserts draft per phase |
| Regenerate step | `title` / `short` / `long` + `isRegenerate: true` | Trial slot or 1 credit post-success | Same draft row |
| Finalize | `generationStep: finalize` | 5 credits post-success | `listing_generations` row |
| Instant preview | `isDraft: true` | Free | Sync on producer |

**Pipeline entry guard:** Individual `title`/`short`/`long` without `pipeline` or `isRegenerate` → `409 modular_pipeline_required`.

### Billing & Settings UI (Session 5)

| Surface | Data source |
|---------|-------------|
| Phase breakdown chart | `GET /api/billing/usage-breakdown` → `listing_generation_costs` |
| Ranking impact chip | `GET /api/workspaces/:id/keywords/ranking-impact` → avg % from `recent_rank_gain` (7-day window) |
| Monthly credit cap | `PATCH /api/workspaces/:id` `{ monthly_credit_cap }` via `updateBudgetCap()` |
| Credit dashboard | `GET /api/workspaces/:id/billing/usage-summary` (donut, efficiency, 30-day trend) |

### Session 5 key files

```
app/api/listings/generate/route.ts          — QStash producer (202)
app/api/listings/worker/route.ts            — QStash consumer
app/api/listings/status/route.ts            — job polling
app/api/billing/usage-breakdown/route.ts
app/api/workspaces/[id]/keywords/ranking-impact/route.ts
src/lib/listing/listing-generation-executor.ts
src/lib/listing/listing-generation-orchestrator.ts  — executionMode read|execute
src/lib/listing/modular-phase-guard.ts      — checkModularPhaseOrder
src/lib/listing/modular-pipeline-state-machine.ts
src/lib/listing/context-gateway.ts
src/lib/listing/sync-queue-hash.ts
src/lib/listing/generation-queue-hash-lock.ts
src/lib/qstash/publish-listing-generation.ts
src/lib/db/listing-generation-costs.ts
src/lib/db/listing-generation-job.ts
src/lib/client/poll-listing-generation-status.ts
src/components/settings/credit-dashboard/
supabase/migrations/20260621130000_workspace_listing_drafts.sql
supabase/migrations/20260622150000_add_queue_hash_index.sql
supabase/migrations/20260622160000_add_listing_generation_costs.sql
supabase/migrations/20260622170000_workspace_monthly_credit_cap.sql
supabase/migrations/20260622180000_listing_generation_job_status.sql
```

### Session 5 environment variables

| Variable | Purpose |
|----------|---------|
| `QSTASH_TOKEN` | Publish async listing jobs |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | Verify worker callbacks |
| `QSTASH_CALLBACK_URL` or `NEXT_PUBLIC_APP_URL` | Worker URL target |
| `INTERNAL_WORKER_SECRET` | Local dev worker invoke without QStash |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Queue-hash locks (+ optional context package) |

### Session 5 verification checklist

1. `supabase db push` — apply migrations through `20260622180000`
2. Set QStash env vars (or `INTERNAL_WORKER_SECRET` for local)
3. Stage keywords → Generate pipeline → receive `202` + `jobId` → poll until `completed`
4. Call `finalize` before pipeline done → `202 WAITING_FOR_PHASES` (not 500)
5. Settings → Billing: phase breakdown + ranking impact render
6. Settings → Integrations: monthly credit cap saves; alert at 80% usage

---

## Session 4 — Modular Listing Pipeline & Billing (June 16, 2026)

Quick handoff for new chat sessions. Vault integration detail lives in `STAGING_VAULT_INTEGRATION_SUMMARY.md`.

### Architectural decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Modular pipeline** (`title → short → long → finalize`) | Phased calls, per-block UX, isolated billing |
| 2 | **Trial-to-Paid regenerates** — workspace-scoped | `trial_regenerations_used` + RPC `consume_modular_listing_regenerate`; server authoritative |
| 3 | **Credits debit after success** | Regenerate RPC runs after orchestrator + Zod pass; validation failure → 400, no debit |
| 4 | **Weighted credit ledger** | `generation_type`: `text` (1–5 credits) vs `media` (Creative Bundle @ 30) |
| 5 | **Draft auto-save** | `useDraftPersistence` → `localStorage`; **also** server `workspace_listing_drafts` per `queue_hash` (Session 5) |
| 6 | **Typed short schema** | `{ variations: [{ type: growth\|conversion\|utility, text }] }` × 3 + Gemini `responseSchema` |
| 7 | **JSON mode per step** | `responseMimeType: application/json`; short step has no auto-retry on validation failure |
| 8 | **Streaming (roadmap)** | Progressive render for 20s+ calls — not yet wired in modular pipeline |

### Phase orchestration

| Phase | `generationStep` | First generate | Regenerate |
|-------|------------------|----------------|------------|
| 1 — Search Foundation | `title` | Free | Trial slot or 1 credit |
| 2 — Discovery & Hook | `short` | Free | Trial slot or 1 credit |
| 3 — Value Narrative | `long` / `hook` / `features` / `closing` | Free | Trial slot or 1 credit |
| Confirm | `finalize` | **5 credits** | N/A |

**API:** `POST /api/listings/generate` with `modularListing`, `isRegenerate`, `contextTitle`, `contextShortDescription`, `lockedKeywords`.  
**Prompt:** `listing-modular-v1.2`. **Client:** `useModularGeneration` + `modular-listing-panel.tsx`.

### Trial-to-Paid & weighted credits

- **3 free** workspace regenerates (`trial_regenerations_used < 3`), then **1 credit** (`modular_listing_regenerate`, `generation_type: text`)
- **Finalize:** 5 credits (`listing_generation`)
- **Creative Bundle:** 30 credits (`brand_kit_batch`, `generation_type: media`)
- Helper: `buildCreditLedgerMeta('text' | 'media')` in `src/lib/features/billing/credit-ledger-meta.ts`

### Data integrity & performance

- **Auto-save key:** `listing-modular-draft:{workspaceId}:modular-listing`
- **Zod:** draft vs finalize ingress; strict short output; no generic padding fallback; 409 `stale_active_context` on queue drift
- **Performance (implemented):** phased calls, JSON mode, single-attempt short gen, post-success billing
- **Performance (planned):** streaming partial responses to client

### Session 4 key files

```
app/api/listings/generate/route.ts
src/lib/gemini/generate-listing-modular.ts
src/lib/listing/listing-generation-orchestrator.ts
src/lib/listing/modular-short-variations.ts
src/lib/prompts/listing-modular.ts
src/lib/features/billing/modular-regenerate-billing.ts
src/hooks/useModularGeneration.ts
src/hooks/useDraftPersistence.ts
src/components/listing/optimizer/modular-listing-panel.tsx
supabase/migrations/20260618120000_workspace_trial_regenerations.sql
```

### Session 4 verification checklist

1. Apply migration `20260618120000_workspace_trial_regenerations.sql`
2. Phase 2 short returns typed `variations[]` (Growth / Conversion / Utility)
3. Regenerate: trial 3→0 then 1 credit; validation failure does not debit
4. Page refresh restores modular draft from localStorage
5. Finalize debits 5 credits and clears draft

---

## Current Architecture Snapshot (June 12, 2026)

### Research → Curate → Synthesize

The platform now follows a **three-phase ASO workflow**:

| Phase | User action | System behavior |
|-------|-------------|-----------------|
| **Research** | Browse Keyword Tracker, Competitor Spy, Reviews, Market Intel | Discovery data stays in feature modules — **not** auto-fed to the AI |
| **Curate** | Select keywords, pain points, gaps → **Add to Optimization Queue** | `OptimizationQueueService` persists locale-isolated items in the vault |
| **Synthesize** | **Generate Full Listing** in AI Listing Optimizer | `buildSynthesisFromOptimizationQueue()` uses **only** queued signals |

**Single source of truth for generation:** `state_{locale}.features.optimization_queue.items[]` inside `workspace_staging_vault`.

### Critical decisions (Session 3 — June 12, 2026)

1. **Optimization Queue as SSOT** — Active Context and Generate Full Listing read only from `optimization_queue`, not raw discovery streams (`competitor_spy`, `keyword_tracker`, etc.).
2. **VaultCore central gateway** — All `workspace_staging_vault` INSERT/UPDATE paths go through `VaultCore.safeUpsert()` / `safeUpdate()` with schema-aware legacy + universal dual-write.
3. **Dual-schema support** — Production DB uses universal vault (`state_en`, `state_ar`, `app_id`). Legacy signal columns (`signal_type`, `metadata`, `content`) may be absent. Code probes schema at runtime via `hasLegacySignalColumns()` / `hasUniversalVaultColumns()`.
4. **Competitor Spy curation** — Removed auto-staging dumps and `localStorage` keyword injection. Unified **Add to Optimization Queue** + `validateAndQueue()` before any navigation to Listing Optimizer.
5. **Typed Active Context** — Signals grouped by type: `keyword_gap`, `review_pain_point`, `feature_request`, `competitor_strength` via `partitionQueueItemsBySignalType()`.
6. **Workspace-scoped providers** — `KeywordCurationModeProvider` + `KeywordSelectionProvider` live in `WorkspaceAppProviders` (dashboard shell) so selection state survives page transitions.
7. **Vault index fix** — Dropped `idx_vault_state_en_features` / `idx_vault_state_ar_features` btree indexes (row size limit ~2704 bytes when `features` JSONB grows). GIN indexes on full `state_en`/`state_ar` remain.
8. **Sentiment analysis** — Migrated from `GEMINI_API_KEY` + AI Studio REST to **Vertex AI** via `getGenerativeModel()`. Fixed `result` variable shadowing bug that caused 500 after successful inference.

### Key new files (Session 3)

```
src/lib/optimization-queue/          — server service, types, synthesis builder
src/lib/client/optimization-queue-client.ts
src/lib/client/validate-and-queue.ts — unified Competitor Spy queue validator
src/lib/staging-vault/vault-core.ts  — centralized vault writes
src/lib/staging-vault/read-competitor-keywords.ts — schema-aware reads
src/hooks/useOptimizationQueue.ts
src/components/app/workspace-app-providers.tsx
app/api/workspaces/[id]/optimization-queue/route.ts
app/api/workspaces/[id]/optimization-queue/[itemId]/route.ts
supabase/migrations/20260612100000_drop_vault_features_btree_indexes.sql
```

### API endpoints added (Session 3)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/workspaces/{id}/optimization-queue?locale=en\|ar&appId=` | Read curated queue |
| `POST` | `/api/workspaces/{id}/optimization-queue` | Add items (batch, deduped) |
| `DELETE` | `/api/workspaces/{id}/optimization-queue/{itemId}` | Remove one item |

`POST /api/workspaces/{id}/staging/add` still exists; it mirrors explicit staging into the queue via `map-staging-to-queue.ts`.

---

## Technology Stack

### Frontend
- **Framework:** Next.js 15.5.19 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS with dark mode
- **Internationalization:** next-intl (EN/AR bilingual)
- **State Management:** React Query (TanStack Query v5)
- **UI Components:** Shadcn/ui + Lucide icons
- **Toast:** Sonner 2.0.7 — configured `theme="dark" position="top-right" closeButton richColors`
- **RTL Support:** CSS logical properties (`ps-*`, `pe-*`, `ms-*`, `me-*`)

### Backend
- **Runtime:** Node.js (Next.js API routes)
- **Database:** Supabase PostgreSQL (project: `gyogncegfdsqlxeavxfn`)
- **ORM:** Supabase Client SDK
- **Authentication:** Supabase Auth (JWT-based)
- **API:** REST endpoints with Zod validation
- **Live Search:** Serper.dev Play Store API
- **Background jobs:** Upstash QStash (listing generation worker)
- **Cache / locks:** Upstash Redis REST (queue-hash locks, optional context package)

### Infrastructure
- **Deployment:** Vercel
- **Database:** Supabase (cloud) — 48+ migrations
- **CLI:** Supabase CLI v2.90.0 (update to v2.105.0 recommended)

---

## Critical Architectural Decisions — Session 2 (June 10, 2026)

### 1. Keyword Validator — Embedded Slide-Over (NOT a standalone page)

**Decision:** The standalone `Keyword Validator Pro` page (`/validator`) was deleted. The validator now lives as a right-side slide-over panel (`max-w-[400px]`) triggered by a "Validate Keyword" button in the **Keyword Tracker page header**.

**Rationale:** Feature bloat — a separate page broke the tracker workflow. Contextual embedding follows the SaaS pattern (Sensor Tower, AppFollow).

**Files changed:**
- `app/[locale]/app/[workspaceId]/validator/page.tsx` → redirects to `/keywords`
- `app/[locale]/app/[workspaceId]/keyword-validator/page.tsx` → redirects to `/keywords`
- `app/[locale]/app/[workspaceId]/layout.tsx` → removed "Keyword Validator Pro" nav entry
- `src/components/keyword-tracker/KeywordValidatorCard.tsx` → new primary component
- `src/components/keyword-tracker/KeywordTrackerClient.tsx` → hosts the panel, passes `appId` + `selectedCountries`

### 2. Tailwind Purge — Inline Styles Required for `./src/` Components

**Decision:** `tailwind.config.ts` only scans `./pages`, `./components`, `./app`. Files in `./src/components` are **outside** the content scan. All background colors, border colors, and positioning values in `KeywordValidatorCard.tsx` use **inline `style` props**.

**Consequence:** Never use arbitrary Tailwind classes (`bg-[#...]`, `max-w-[400px]`) in `./src/` files unless those classes already appear in a scanned file. Use `style={{ ... }}` instead.

**Panel anchor pattern (purge-safe):**
```tsx
style={{
  right: 0,           // Physical — never inset-inline-* on fixed elements
  maxWidth: '400px',
  transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
  transition: 'transform 300ms ease-in-out',
}}
```

### 3. Dashboard Is English-Only

**Decision:** The authenticated Growth Hub dashboard renders only in English. Arabic users set their locale on the landing page before logging in — that locale does not carry into the dashboard shell.

**Consequence:** `KeywordValidatorCard.tsx` has zero `useLocale()`, zero Arabic branching, zero `font-arabic`. All `locale: 'en'` is hardcoded for vault writes. The `keywordValidator` namespace exists in both `messages/en.json` and `messages/ar.json` for **future parity**, but is not consumed by the dashboard component.

### 4. `workspace_staging_vault` Migration Reconciled

**Problem:** The table existed in the live DB but was never in the migration files. The migration file `20260610_universal_staged_state_architecture.sql` had an 8-digit name (invalid).

**Resolution:**
1. Renamed file to `20260610000000_universal_staged_state_architecture.sql`
2. Old `workspace_staging_vault` (signal-log schema) renamed to `workspace_signal_log`
3. New dual-state vault created manually in Supabase SQL editor
4. All 43 migrations reconciled via `npx supabase migration repair --status applied`

**Live schema confirmed:**
```
id, workspace_id, app_id, state_en (jsonb), state_ar (jsonb),
created_at, updated_at, deleted_at, last_modified_by,
change_count, active_features (array), is_deleted
+ 8 performance indexes (idx_vault_*)
+ RLS policies enabled
```

### 5. Producer Stubs Created

The `producer-registry.ts` had dynamic imports to 5 non-existent producer files, causing webpack bundle crashes. Stub files were created at `src/lib/producers/`:

- `keyword-tracker.producer.ts` — stub
- `competitor-spy.producer.ts` — stub
- `review-analysis.producer.ts` — stub
- `keyword-validator.producer.ts` — stub (owns `state_{locale}.features.keyword_validator.*`)
- `experiment-snapshots.producer.ts` — stub

Also fixed: `vault.types.ts` imported `json-schema-to-ts` which is not installed → replaced with comment.

### 6. Live Rank — Correct Resolution via `package_name`

**Bug fixed:** Original implementation searched for any app whose *title contains the keyword string* — always returned `#1`. 

**Correct approach** (mirrors `serper-refresh/route.ts`):
1. Fetch app's `package_name` from `apps` table
2. Run `searchPlayStore(keyword, markets)` — returns real Play Store SERP
3. Call `resolveRankInCountryForSerperSnapshot(results, packageName, market)` — finds user's app by exact package ID

---

## Completed Modules

### 1. Keyword Validator ✅ (fully overhauled this session)

**Status:** Production Ready

**Primary Component:** `src/components/keyword-tracker/KeywordValidatorCard.tsx`

**Props:**
```typescript
interface KeywordValidatorCardProps {
  workspaceId: string;
  appId?: string;              // UUID — vault write target
  selectedCountries?: string[]; // from Keyword Tracker CountrySelector
  isOpen: boolean;
  onClose: () => void;
  onKeywordStaged?: (keyword: string, score: KeywordScore) => void;
}
```

**KeywordScore type:**
```typescript
interface KeywordScore {
  keyword: string;
  difficulty: number;     // 0-10 (heuristic)
  confidence: number;     // 0-100 (heuristic)
  searchVolume: number;   // heuristic estimate
  competition: number;    // 0-100 (heuristic)
  monthlyInstalls: { low: number; realistic: number; high: number };
  recommendation: 'HIGH_CONFIDENCE' | 'MEDIUM_OPPORTUNITY' | 'SKIP';
  liveRanks?: Record<string, { rank: number | null; fetched_at: string; error?: string }>;
}
```

**Features:**
- Viability score with SVG arc gauge (0–10)
- Confidence ring (mini SVG)
- Difficulty badge (Easy/Medium/Hard)
- All metrics labelled "Est." with hover tooltip: "Estimated based on historical model"
- Two-step inline CTA: Stage (free) → Fetch Live Rank (N credits)
- Per-market rank grid after fetch
- Individual result removal (X button per card)
- localStorage persistence (workspace-scoped, hydration-safe)
- `invalidateQueries(['optimizer-context', workspaceId])` after stage + live rank

**API Endpoints:**
- `POST /api/workspaces/{id}/validator/validate-keyword` — **free, zero credits**
- `POST /api/workspaces/{id}/validator/live-rank` — **1 credit per market**

**validate-keyword route — DB column mapping:**
```
keyword_term, language, workspace_id, difficulty_score,
search_volume, top_app_count, confidence_percentage,
recommendation (jsonb), estimated_monthly_installs (jsonb)
category → stored inside recommendation JSONB (not a top-level column)
```

**live-rank route flow:**
```
Auth → membership → fetch app.package_name → Serper configured check
→ balance read → consume N credits (RPC SELECT FOR UPDATE)
→ searchPlayStore(keyword, markets[])
→ resolveRankInCountryForSerperSnapshot(results, packageName, market) per market
→ JSONB write: state_en.features.keyword_validator.signals.[keyword].live_ranks.[market_code]
→ refund on total failure (partial success = no refund)
→ optimizer/sync fire-and-forget
```

**Credit model:** `serperAiCreditsForCountryCount(markets.length)` — 1 credit × N markets. Same rate as Keyword Tracker refresh.

---

### 2. Experiment Snapshots ✅ (locale parity — Session 2)

**Status:** Production Ready — see Session 2 notes in git history; parity fixes for `listing->>language` filter.

---

### 3. Enhanced Synthesis (ASO Synthesizer) ✅

**Status:** Production Ready — generation now queue-backed (Session 3)

**Components:**
- `src/lib/synthesis/aso-synthesizer-service.ts`
- `src/lib/staging/synthesis-context-builder.ts`
- `src/lib/optimization-queue/optimization-queue-synthesis.ts` — `buildSynthesisFromOptimizationQueue()`

---

### 4. Optimization Queue & VaultCore ✅ (Session 3)

**Status:** Production Ready

**Workflow:** Research → Curate → Synthesize

**Server:**
- `src/lib/optimization-queue/optimization-queue.service.ts`
- `src/lib/staging-vault/vault-core.ts`
- `src/lib/staging/optimizer-context-adapter.ts`

**Client:**
- `src/hooks/useOptimizationQueue.ts`
- `src/lib/client/validate-and-queue.ts`
- `src/components/optimizer/OptimizerWorkspace.tsx`
- `src/components/app/workspace-app-providers.tsx`

**Competitor Spy changes:**
- Unified **Add to Optimization Queue** (gaps, quick wins, review insights, keyword curation bar)
- Removed auto-staging on snapshot load
- Review insights: progressive disclosure + sentiment via Vertex AI (`POST .../competitors/sentiment`)

---

## UI Integration Status

### Navigation Structure
```
PlayStore Menu (static — do not modify)
├─ Home
├─ Keyword Tracker          ← "Validate Keyword" button in page header (top-right)
├─ AI Listing Optimizer
├─ Brand Assets
├─ Competitor Spy
├─ Reviews
├─ Market Intel
├─ Alerts
└─ Settings
```

**CRITICAL:** "Keyword Validator Pro" was a navigation error and has been removed. There is no standalone validator page. The validator is a slide-over on the Keyword Tracker screen.

### Component Status

| Component | Type | Status |
|-----------|------|--------|
| Keyword Validator | Slide-over panel (400px) | ✅ Complete |
| Live Rank Fetch | Server-side credit-gated API | ✅ Complete |
| Experiment Snapshots | Tabbed panel | ✅ Complete (parity fixed) |
| Optimization Queue | Active Context SSOT | ✅ Complete (Session 3) |
| Modular Listing Pipeline | Phased title/short/long + finalize | ✅ Complete (Session 4) |
| Trial-to-Paid regenerates | Workspace trial counter + post-success debit | ✅ Complete (Session 4) |
| Draft auto-save | `useDraftPersistence` (localStorage) | ✅ Complete (Session 4) |
| Competitor Spy curation | Add to Queue + badges | ✅ Complete (Session 3) |
| VaultCore | Centralized vault writes | ✅ Complete (Session 3) |
| Enhanced Synthesis | Queue-backed generation | ✅ Complete (Session 3) |
| Producer Stubs | Stub implementations | ✅ Webpack-safe |

---

## i18n — `keywordValidator` Namespace

Both `messages/en.json` and `messages/ar.json` have a full `keywordValidator` namespace with 45 keys covering all UI copy, tooltips, toast messages, and live rank education strings.

**Note:** The dashboard component (`KeywordValidatorCard.tsx`) uses hardcoded English strings directly — it does NOT call `useTranslations('keywordValidator')`. The namespace is there for future bilingual contexts.

---

## Vault Write Patterns

### KeywordValidatorProducer writes

**Staging (free):**  
`POST /api/workspaces/{id}/staging-vault/keywords`  
Body: `{ locale: 'en', keyword, difficulty, confidence, searchVolume, competition, monthlyInstalls, recommendation }`

**Live rank (1 credit/market):**  
`POST /api/workspaces/{id}/validator/live-rank`  
Vault path: `state_{locale}.features.keyword_validator.signals.[keyword].live_ranks.[market_code]`

```json
{
  "state_en": {
    "features": {
      "keyword_validator": {
        "signals": {
          "calorie": {
            "live_ranks": {
              "us": { "rank": 1, "fetched_at": "2026-06-10T..." },
              "in": { "rank": null, "fetched_at": "2026-06-10T..." }
            },
            "last_fetched_at": "2026-06-10T..."
          }
        }
      }
    }
  }
}
```

---

## Optimizer Integration (Updated June 12, 2026)

### Active Context — queue-only

`optimizer-context-adapter.ts` → `flattenVaultToActiveItems()` reads **only** `features.optimization_queue`. Raw feature namespaces (`competitor_spy`, `keyword_tracker`, etc.) are **not** surfaced unless mirrored into the queue.

**Typed grouping** (`partitionQueueItemsBySignalType`):

| UI section | Signal types |
|------------|--------------|
| Review Insights | `review_pain_point`, `feature_request` |
| Keyword Gaps | `keyword_gap`, `market_keyword`, `competitor_keyword` (legacy) |
| Competitor Strengths | `competitor_strength`, `competitor_weakness` (legacy) |

### Client hooks & invalidation

```typescript
// Queue state
useOptimizationQueue(workspaceId, locale, appId?)
// Query key: ['optimization-queue', workspaceId, locale, appId]

// Optimizer context (queue-backed)
useOptimizerSync(workspaceId, { vaultLocale: locale, appId })
// Query key: ['optimizer-context', workspaceId, locale]
```

After queue mutations, invalidate **both** keys:

```typescript
queryClient.invalidateQueries({ queryKey: ['optimization-queue', workspaceId, locale, appId ?? ''] });
queryClient.invalidateQueries({ queryKey: ['optimizer-context', workspaceId, locale] });
```

### Generate Full Listing (modular — async since Session 5)

- **Producer:** `POST /api/listings/generate` → validates, context gateway, phase read-check → `202 { jobId }` (or sync for `isDraft: true`)
- **Worker:** QStash → `POST /api/listings/worker` → serialized title → short → long → post-success billing
- **Polling:** `GET /api/listings/status?jobId=` until `completed` | `failed`
- **WAITING_FOR_PHASES:** `202` when finalize/regenerate called before prerequisite phases persisted (not 500)
- **Pipeline entry:** `generationStep: pipeline` or `isRegenerate: true` required for individual steps
- **Finalize:** `generationStep: finalize` → 5 credits post-success in worker
- **Regenerate:** `isRegenerate: true` → trial slot or 1 credit post-success
- Synthesis: `buildSynthesisFromOptimizationQueue()` + Context Gateway keyword compile
- Empty staged keywords → `400 KEYWORD_CONTEXT_REQUIRED`

### Competitor Spy → Optimizer flow

```typescript
// validateAndQueue() — src/lib/client/validate-and-queue.ts
// 1. Validate non-empty payload + EN/AR locale match
// 2. await addToOptimizationQueueClient()
// 3. Only then router.push('/listing-optimizer') if navigate: true
```

Used by: Keyword Gaps CTA, Quick Wins cards, Review Insights exploit button, keyword curation floating bar.

---

## Known Bugs Fixed

### Session 3 (June 12, 2026)

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| `No writable vault schema detected` on competitor staging | Universal DB has no legacy columns; `competitor_weakness` had no universal write path | `VaultCore.upsertUniversalFeatureSignal()` + `resolveVaultAppId()` |
| `column metadata does not exist` on competitor keywords GET | Route queried legacy `metadata`/`signal_type` | `readCompetitorKeywordsFromVault()` — schema-aware read |
| `index row size exceeds btree maximum` on queue POST | `idx_vault_state_en_features` btree on large `features` JSONB | Migration `20260612100000` drops btree feature indexes; queue metadata slimmed |
| Sentiment analysis 500 after Gemini success | Inner `let result` shadowed outer `result` → ReferenceError | Removed shadowing; migrated to Vertex AI `getGenerativeModel()` |
| Active Context lost on navigation | `KeywordCurationModeProvider` page-scoped in Competitor Spy | Moved to `WorkspaceAppProviders` in dashboard shell |
| Blank optimizer after Send | `router.push` before queue write completed | `validateAndQueue()` awaits persistence first |
| `listVaultSignals` not exported | Facade incomplete after VaultCore refactor | Re-exported from `staging-vault-service.ts` |

### Session 2 (June 10, 2026)

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Panel transparent | Tailwind purge — `bg-[#...]` in `./src/` outside scan path | All colours moved to inline `style` props |
| Panel on wrong edge | `inset-inline-end` on `fixed` element + own `dir` attr conflicts | `right: 0` inline style (physical, unambiguous) |
| Webpack crash on `/keywords` | `vault.types.ts` imported `json-schema-to-ts` (not installed) | Removed import, replaced with comment |
| Hydration mismatch | `useState(() => loadResults())` runs on server (no localStorage) | Empty initial state + `useEffect` after mount |
| Live rank returns `#1` always | Searched for app whose *title contains keyword* | Uses `resolveRankInCountryForSerperSnapshot(results, packageName, market)` |
| DB insert error: `category` column | `keyword_viability_scores` has different schema than assumed | Column mapping verified and corrected |
| DB insert error: `competition` column | Same table schema mismatch | Fixed in same pass |
| `workspace_apps` table not found | Table is named `apps` | Fixed in `live-rank/route.ts` |
| Experiment snapshots mixed EN/AR | `filters.language` accepted but never applied to query | `.eq("listing->>language", filters.language)` added |
| Toast invisible | `<Toaster>` missing `theme="dark"` — neutral toasts render white | Added `theme="dark"` to `providers.tsx` |
| Metrics overflow in panel | `grid-cols-3` too tight at 400px | `grid-cols-2` + installs `col-span-2` |
| JSX comment crash | `ps-*/pe-*` — `*/` closed JSX comment early | Rewrote comment text |

---

## Known Limitations

| Issue | Impact | Planned Solution |
|-------|--------|-----------------|
| Heuristic scoring only | "nutrition" and "calorie" score identically | Serper keyword difficulty API integration |
| Live rank is point-in-time | Ranks shift hourly; no history | Store snapshots with timestamps, build history chart |
| No rank history in validator | Only shows latest rank | Extend `live_ranks` schema with array of snapshots |
| Producer stubs only | `initializeDefaultProducers()` not functional | VaultCore handles writes; producers remain stubs |
| Queue size / vault JSON growth | Large `features` blob from multiple namespaces | Queue capped at 50 items; slim metadata; avoid btree feature indexes |
| Manual metric entry | Users record installs weekly | Google Play API sync |
| 6K token limit | Context may truncate | Extended context windows |

---

## Database Schema

### `workspace_staging_vault` (confirmed live ✅)
```sql
id UUID PRIMARY KEY
workspace_id UUID NOT NULL
app_id UUID NOT NULL
state_en JSONB  -- features.keyword_validator.signals.[kw].live_ranks.[market]
state_ar JSONB  -- same structure, isolated
created_at, updated_at, deleted_at TIMESTAMPTZ
last_modified_by UUID → auth.users
change_count INT DEFAULT 0
active_features TEXT[] DEFAULT '{}'
is_deleted BOOLEAN DEFAULT FALSE
UNIQUE(workspace_id, app_id)
```

### `keyword_viability_scores` (confirmed live ✅)
```
id, workspace_id, keyword_term, language, difficulty_score,
search_volume, top_app_count, estimated_monthly_installs (jsonb),
confidence_percentage, recommendation (jsonb), created_at,
expires_at, staged_signal_id
```
⚠️ No `category` column — stored inside `recommendation` JSONB.

### `apps`
```
id, workspace_id, package_name (required for live rank), name, ...
```
⚠️ Table is named `apps`, NOT `workspace_apps`.

### `experiment_snapshots`
Language stored inside `listing` JSONB column: `listing->>language`. Query with `.eq("listing->>language", locale)`.

### `workspace_listing_drafts` (Session 5 ✅)
```
workspace_id, queue_hash (UNIQUE together), app_id, vault_locale
job_id, generation_status, generation_error, current_phase
generation_payload JSONB, generation_result JSONB
title, short_description, long_description JSONB (phase outputs)
```

### `listing_generation_costs` (Session 5 ✅)
Per-phase telemetry: `workspace_id`, `generation_step`, `credits_charged`, token counts, `created_at`.

### `workspaces` (billing additions)
```
monthly_credit_cap INT NULL   -- user budget (migration 20260622170000)
trial_regenerations_used INT  -- modular regen trial slots (Session 4)
```

### `workspace_keywords` (context gateway)
```
queue_hash TEXT NULL   -- stamped by syncQueueHash before generation
-- Index: workspace_keywords_queue_hash_idx
```

## Troubleshooting

### Build Cache Issues (most common)
```bash
rm -rf .next
npm run dev
```
Run from the project root whenever you see stale UI or `__webpack_exec__` errors.

### Panel Transparent
**Cause:** Arbitrary Tailwind class in `./src/` component purged at build time.  
**Fix:** Use inline `style={{ backgroundColor: '#...' }}` instead of `bg-[#...]`.

### Webpack Crash on `/keywords`
**Cause:** A module in the bundle imports a missing package.  
**Fix:** Check `vault.types.ts` and producer files for unresolved imports. Run `rm -rf .next && npm run dev`.

### Live Rank Returns Wrong Results
**Cause:** `package_name` not set for the app in workspace settings.  
**Fix:** Settings → App → set Android package name (e.g. `com.yourapp.id`). Route returns `422` with clear message if missing.

### RTL Layout Breaks
**Cause:** Hard-coded `left`/`right` or `pl-`/`pr-` instead of logical properties.  
**Fix:** Use `ps-*`/`pe-*` (padding) and `ms-*`/`me-*` (margin). Physical `right: 0` is correct only for `fixed` panel anchors.

### Toast Invisible
**Cause:** `<Toaster>` missing `theme="dark"`.  
**Fix:** `providers.tsx` → `<Toaster richColors theme="dark" position="top-right" closeButton />`

### Supabase Migration Drift
```bash
npx supabase migration repair --status applied <version>
npx supabase migration list
```

### Optimization Queue POST fails (index row size)
**Cause:** Btree indexes on `(state_en -> 'features')` exceed PostgreSQL row limit when vault JSON grows.  
**Fix:** Apply `supabase/migrations/20260612100000_drop_vault_features_btree_indexes.sql`:
```sql
DROP INDEX IF EXISTS idx_vault_state_en_features;
DROP INDEX IF EXISTS idx_vault_state_ar_features;
```

### Competitor keywords empty but staging “succeeds”
**Cause:** Universal vault stores data in `state_en.features.competitor_spy`, not legacy `metadata` column.  
**Fix:** Ensure `read-competitor-keywords.ts` is wired; pass `sourceAppId` from Competitor Spy when staging.

---

## Manual Test Checklist (Session 5)

1. **Async pipeline:** Stage keywords → Generate pipeline → `202` + `jobId` → poll until `completed`
2. **WAITING_FOR_PHASES:** Call finalize before pipeline done → `202` (not 500)
3. **Context gate:** Generate with zero staged keywords → `400 KEYWORD_CONTEXT_REQUIRED`
4. **Billing dashboard:** Phase breakdown chart renders from usage-breakdown API
5. **Monthly cap:** Settings → Integrations saves `monthly_credit_cap`
6. **Locale isolation:** EN queue items do not appear in AR optimizer

## Manual Test Checklist (Session 3)

1. **Competitor Spy (EN & AR):** select keywords → **Add to Optimization Queue** → badge updates
2. **Review Insights:** Analyze sentiment → **Add to Optimization Queue** → items under Review Insights in Active Context
3. **Listing Optimizer:** only queued items visible; remove pill → deletes from queue
4. **Generate:** with queue populated → synthesis uses only curated signals
5. **Locale isolation:** EN queue items do not appear in AR optimizer
6. **Navigation:** queue items persist after Competitor Spy → Listing Optimizer transition

---

**Version:** 5.0  
**Last Updated:** June 22, 2026  
**Status:** Production — Active Development
