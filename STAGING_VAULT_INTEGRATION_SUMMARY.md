# Staging Vault Integration Summary

**Document Version:** 5.0  
**Last Updated:** June 22, 2026  
**Scope:** Growth Hub Staged-State Architecture + Optimization Queue + Modular Listing Pipeline + Async Context Gateway  
**Audience:** Senior developers, architects, future maintainers  

---

## Executive Overview

The **Staging Vault** is the architectural foundation of Growth Hub. It implements a **Producer-Consumer pattern** with strict feature isolation, bilingual state separation, and zero-breaking-changes evolution semantics.

As of June 12, 2026, the vault hosts the **Optimization Queue** — the single source of truth for AI Listing Optimizer Active Context and listing synthesis.

As of June 16, 2026 (Session 4), the **Listing Optimizer** runs a **Modular Listing Pipeline** (phased title → short → long → finalize) with workspace-scoped trial regenerates, weighted credit ledger metadata, and strict Zod validation on AI output.

As of June 22, 2026 (Session 5), listing generation is **async via Upstash QStash** (producer validates + enqueues; worker runs Gemini orchestration). A **Context Gateway** stamps `workspace_keywords.queue_hash` and compiles step-scoped signals before generation. Draft state persists in **`workspace_listing_drafts`** (DB) plus browser `localStorage` recovery. Granular billing telemetry (`listing_generation_costs`) and Settings billing UI (phase breakdown, ranking impact, monthly credit cap) ship alongside.

**Core Value:** Enables unlimited feature scaling without cross-feature data corruption while maintaining backwards compatibility across all client versions.

**Key facts for new sessions:**
- **Research → Curate → Synthesize** — discovery modules do not auto-feed the AI; users explicitly queue signals first
- **Active Context reads only `features.optimization_queue`** — not raw `competitor_spy` / `keyword_tracker` namespaces
- **Context Gateway** stamps staged `workspace_keywords` with `queue_hash` before generation — zero staged keywords → `400 KEYWORD_CONTEXT_REQUIRED`
- **Modular pipeline is async** — `POST /api/listings/generate` returns `202` + `jobId`; worker runs orchestration; client polls `GET /api/listings/status`
- **Phase guard on producer** — `checkModularPhaseOrder()` returns `WAITING_FOR_PHASES` (202) when prerequisites not persisted; worker uses `assertModularPhaseOrder()`
- **Regenerate billing is post-success** — credits/trial slots consumed only after worker + Zod validation succeed
- **VaultCore** (`src/lib/staging-vault/vault-core.ts`) is the centralized write gateway with legacy + universal schema detection
- Production DB uses **universal vault** (`state_en`, `state_ar`, `app_id`) — legacy columns (`signal_type`, `metadata`, `content`) may be absent
- **Do not** create btree indexes on `(state_en -> 'features')` — row size limit ~2704 bytes; use GIN on full `state_en`/`state_ar` instead
- `workspace_staging_vault` is a **different table** from `workspace_signal_log` (old signal-log, renamed)
- `./src/components` is **outside Tailwind's content scan** — all critical styles must be inline

---

## Architecture Foundation

### Problem Statement

Traditional feature architecture in ASO platforms suffers from:
- **Feature Coupling:** One feature's bug corrupts another's data
- **State Bloat:** Monolithic state grows uncontrollably
- **Breaking Changes:** Schema migrations require client updates
- **Bilingual Complexity:** EN/AR state entanglement

### Solution: Staged-State Producer Pattern

The Staging Vault enforces:
1. **Strict Producer Isolation** — Each feature owns its state boundary
2. **Bilingual State Separation** — Locale-keyed state (`state_en`, `state_ar`)
3. **Backwards Compatibility** — Schema never breaks, only evolves additively
4. **Audit Trail** — `change_count`, `last_modified_by`, `updated_at` on every write

---

## Live Database Schema (confirmed June 10, 2026)

```sql
CREATE TABLE workspace_staging_vault (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL,
  app_id           UUID NOT NULL,
  state_en         JSONB NOT NULL DEFAULT '{"features":{}, "metadata":{"locale":"en","schema_version":"1.0"}}',
  state_ar         JSONB NOT NULL DEFAULT '{"features":{}, "metadata":{"locale":"ar","schema_version":"1.0"}}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  last_modified_by UUID REFERENCES auth.users(id),
  change_count     INT DEFAULT 0,
  active_features  TEXT[] DEFAULT '{}',
  is_deleted       BOOLEAN DEFAULT FALSE,
  UNIQUE(workspace_id, app_id)
);
```

**Active indexes (June 12, 2026):**
```
idx_vault_workspace_app       — (workspace_id, app_id)
idx_vault_active_features     — GIN on active_features
idx_vault_updated_at          — (updated_at DESC)
idx_vault_not_deleted         — (is_deleted, workspace_id)
idx_vault_state_en            — GIN on state_en          ← use for JSONB queries
idx_vault_state_ar            — GIN on state_ar          ← use for JSONB queries
```

**Removed indexes** (migration `20260612100000_drop_vault_features_btree_indexes.sql`):
```
idx_vault_state_en_features   — DROPPED (btree row size limit when features JSONB grows)
idx_vault_state_ar_features   — DROPPED (same)
```

⚠️ If queue writes fail with `index row size ... exceeds btree maximum`, apply the migration above.

RLS enabled. Policies: SELECT/INSERT/UPDATE scoped to `workspace_members`.

---

## JSONB State Schema

### Root structure

```typescript
interface WorkspaceStagingVault {
  id: UUID;
  workspace_id: UUID;
  app_id: UUID;
  state_en: StagingState;   // English feature data
  state_ar: StagingState;   // Arabic feature data — always isolated
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at?: Timestamp;
  last_modified_by: UUID;
  change_count: number;
  active_features: string[];
  is_deleted: boolean;
}

interface StagingState {
  features: Record<string, unknown>;  // feature_key → feature_data
  metadata: {
    locale: 'en' | 'ar';
    schema_version: string;
    last_producer?: string;
    last_producer_timestamp?: string;
    feature_count?: number;
    dirty_flags?: Record<string, boolean>;
  };
}
```

### Feature namespaces inside `state_{locale}.features`

| Feature key | Owner / writer | Data written | Active Context? |
|-------------|---------------|-------------|-----------------|
| **`optimization_queue`** | **`OptimizationQueueService`** | **`items[]` curated signals** | **✅ YES — SSOT** |
| `keyword_validator` | `KeywordValidatorProducer` / live-rank route | `signals.[keyword].live_ranks.[market]` | Only if mirrored to queue |
| `keyword_tracker` | `KeywordTrackerProducer` / VaultCore | tracked keywords + rank snapshots | Only if mirrored to queue |
| `experiment_snapshots` | `ExperimentSnapshotsProducer` | baselines + variants | No |
| `competitor_spy` | `VaultCore.upsertUniversalFeatureSignal` | `competitors[]`, `staged_signals` | Only if mirrored to queue |
| `review_analysis` | `ReviewAnalysisProducer` | review themes + opportunities | Only if mirrored to queue |

**Rule (June 2026):** `optimizer-context-adapter.flattenVaultToActiveItems()` reads **only** `optimization_queue`. Discovery namespaces are for module-internal state, not optimizer injection.

---

## Optimization Queue (Research → Curate → Synthesize)

### Storage shape

```typescript
// state_en.features.optimization_queue (state_ar is isolated copy for AR locale)
{
  items: OptimizationQueueItem[];
  updatedAt: string; // ISO timestamp
}

interface OptimizationQueueItem {
  id: string;
  type: OptimizationQueueItemType;
  content: string;
  source: 'keyword_tracker' | 'competitor_spy' | 'review_analysis' | 'market_intel' | 'manual';
  sourceContext?: string;
  sourceContextId?: string;
  language: 'en' | 'ar';
  stagedAt: string;
  metadata: Record<string, unknown>; // slimmed on write (allowed keys only)
}
```

### Canonical signal types (Active Context)

| Type | UI section | Typical source |
|------|------------|----------------|
| `keyword_gap` | Keyword Gaps | Competitor Spy gaps, curation, market |
| `review_pain_point` | Review Insights | Review sentiment bugs / pain |
| `feature_request` | Review Insights | Review sentiment requests |
| `competitor_strength` | Competitor Strengths | Weakness / positioning angles |

Legacy types still accepted on read/write: `competitor_keyword`, `market_keyword`, `competitor_weakness` — normalized via `normalizeQueueSignalType()`.

### Service layer

```
src/lib/optimization-queue/
  optimization-queue.service.ts   — read / add / remove (vault JSONB patch)
  optimization-queue-synthesis.ts — buildSynthesisFromOptimizationQueue()
  optimization-queue.types.ts
  map-staging-to-queue.ts         — staging/add → queue bridge
  index.ts
```

**Limits:** max **50** items per locale branch; content trimmed to **500** chars; metadata whitelisted keys only.

### API

| Method | Path |
|--------|------|
| `GET` | `/api/workspaces/{id}/optimization-queue?locale=en\|ar&appId=` |
| `POST` | `/api/workspaces/{id}/optimization-queue` — body: `{ locale, appId?, items: AddOptimizationQueueInput[] }` |
| `DELETE` | `/api/workspaces/{id}/optimization-queue/{itemId}?locale=&appId=` |

### Client

```
src/hooks/useOptimizationQueue.ts
src/lib/client/optimization-queue-client.ts
src/lib/client/validate-and-queue.ts   — validate payload + locale, await write, then navigate
```

**Query keys:**
```typescript
['optimization-queue', workspaceId, locale, appId ?? '']
['optimizer-context', workspaceId, locale]
```

---

## VaultCore (Centralized Write Gateway)

**Location:** `src/lib/staging-vault/vault-core.ts`

All `workspace_staging_vault` INSERT/UPDATE paths should use:

```typescript
VaultCore.safeUpsert(supabase, payload)
VaultCore.safeUpdate(supabase, payload)
```

### Schema detection

```typescript
// src/lib/staging-vault/staging-vault-schema.ts
hasLegacySignalColumns()   // signal_type + content probe
hasUniversalVaultColumns() // state_en + state_ar + app_id probe
```

### Write strategy

1. **Legacy path** (if columns exist): insert row with `signal_type`, `content`, `metadata`
2. **Universal path** (if columns exist): patch `state_{locale}.features`
   - `keyword` → `upsertUniversalKeyword()`
   - `competitor_weakness` / `review_issue` → `upsertUniversalFeatureSignal()`
3. If legacy insert fails but universal available → **continue** to universal (no early abort)
4. `resolveVaultAppId()` — from `sourceAppId` or first workspace app

### Facade

`staging-vault-service.ts` → `addSignalToVault()`, `listVaultSignals()` delegates to VaultCore.

### Schema-aware reads

| Reader | File | Notes |
|--------|------|-------|
| Competitor keywords | `read-competitor-keywords.ts` | Legacy `metadata` OR universal `competitor_spy.competitors` |
| Active Context | `optimizer-context-adapter.ts` | Queue-only via `flattenQueueToActiveItems()` |
| Keyword signals | `keyword-signals.ts` | Schema-aware fetch for sandbox |

---

## Complete JSONB Example

```json
{
  "state_en": {
    "metadata": { "locale": "en", "schema_version": "1.0", "last_producer": "optimization_queue" },
    "features": {
      "optimization_queue": {
        "items": [
          {
            "id": "oq-1718123456789-abc123",
            "type": "keyword_gap",
            "content": "calorie counter",
            "source": "competitor_spy",
            "sourceContext": "MyFitnessPal",
            "sourceContextId": "com.myfitnesspal.android",
            "language": "en",
            "stagedAt": "2026-06-12T12:00:00.000Z",
            "metadata": { "category": "competitor_gap", "from_keyword_curation": true }
          },
          {
            "id": "oq-1718123456790-def456",
            "type": "review_pain_point",
            "content": "app crashes on login",
            "source": "competitor_spy",
            "language": "en",
            "stagedAt": "2026-06-12T12:05:00.000Z",
            "metadata": { "from_review_insights": true, "signal_kind": "pain_point" }
          }
        ],
        "updatedAt": "2026-06-12T12:05:00.000Z"
      },
      "keyword_validator": {
        "signals": {
          "calorie tracker": {
            "live_ranks": {
              "us": { "rank": 3, "fetched_at": "2026-06-10T09:48:00Z" },
              "in": { "rank": null, "fetched_at": "2026-06-10T09:48:00Z" },
              "sa": { "rank": 12, "fetched_at": "2026-06-10T09:48:00Z" }
            },
            "last_fetched_at": "2026-06-10T09:48:00Z"
          },
          "nutrition app": {
            "live_ranks": {
              "us": { "rank": null, "fetched_at": "2026-06-10T10:00:00Z" }
            },
            "last_fetched_at": "2026-06-10T10:00:00Z"
          }
        },
        "validated_keywords": [
          {
            "term": "calorie tracker",
            "difficulty": 8.0,
            "confidence": 51,
            "searchVolume": 150000,
            "competition": 60,
            "monthlyInstalls": { "low": 220, "realistic": 840, "high": 2400 },
            "recommendation": "skip_this"
          }
        ]
      }
    }
  },
  "state_ar": {
    "metadata": { "locale": "ar", "schema_version": "1.0" },
    "features": {}
  }
}
```

---

## Producer Architecture

### Isolation Rules

- **Only the owning producer can write to its `features.[key]`**
- Cross-feature **reads** are allowed (e.g. `SynthesisContextBuilder` reads all features)
- Cross-feature **writes** throw `IsolationViolationError`
- `ProducerRegistry.verifyIsolation()` diffs vault before/after every production call

### Producer Registry

`src/lib/staging/producer-registry.ts` — routes requests, enforces isolation.

```typescript
producerRegistry.produce(featureKey, vault, input, locale, userId)
// → validates locale
// → checks producer.locales.includes(locale)
// → calls producer.produce(vault, input, locale, userId)
// → verifyIsolation(before, after, featureKey, locale)
// → throws IsolationViolationError if any other feature/locale changed
```

### Current Producer Stubs

All 5 producers are **stubs** — they satisfy the interface but have no real production logic. Full implementation is pending.

```
src/lib/producers/
  keyword-validator.producer.ts    ← featureKey: "keyword_validator"
  keyword-tracker.producer.ts      ← featureKey: "keyword_tracker"
  experiment-snapshots.producer.ts ← featureKey: "experiment_snapshots"
  competitor-spy.producer.ts       ← featureKey: "competitor_spy"
  review-analysis.producer.ts      ← featureKey: "review_analysis"
```

⚠️ `initializeDefaultProducers()` in `producer-registry.ts` is **never called** at boot — producers must be explicitly initialized before `vaultRouter.routeProducerRequest()` will work.

### Direct Vault Writes (Bypass Pattern)

The `live-rank` route writes directly to `workspace_staging_vault` via Supabase client rather than through `vaultRouter/producerRegistry`. This is intentional:
- Importing `vaultRouter` → `producerRegistry` → dynamic imports to producer files causes webpack to try resolving those files during static path generation, crashing the `/keywords` page bundle
- The direct JSONB patch is additive and stays within `KeywordValidatorProducer`'s boundary
- Once producers have real implementations, this can be migrated to the standard route

---

## Vault Write API Endpoints

### `POST /api/workspaces/{id}/staging-vault/keywords`
Stages a validated keyword into the vault (free, no credits).

```json
{
  "locale": "en",
  "keyword": "calorie tracker",
  "difficulty": 8.0,
  "confidence": 51,
  "searchVolume": 150000,
  "competition": 60,
  "monthlyInstalls": { "low": 220, "realistic": 840, "high": 2400 },
  "recommendation": "skip_this"
}
```

### `POST /api/workspaces/{id}/validator/live-rank`
Fetches real Play Store rank and writes it to the vault. **1 credit per market.**

```json
{
  "keyword": "calorie tracker",
  "countries": ["us", "in"],
  "appId": "uuid-of-app",
  "locale": "en"
}
```

**Response:**
```json
{
  "ok": true,
  "keyword": "calorie tracker",
  "results": [
    { "country": "us", "rank": 3 },
    { "country": "in", "rank": null }
  ],
  "creditsCharged": 2,
  "balanceAfter": 89,
  "rankedAt": "2026-06-10T09:48:00Z"
}
```

**Rank resolution:** Uses `resolveRankInCountryForSerperSnapshot(serperResults, app.package_name, market)` — the same function as Keyword Tracker refresh. Requires app to have `package_name` set.

**Credit flow:**
```
balance read (non-locking)
→ consumeWorkspaceAiCredits RPC (SELECT FOR UPDATE — tamper-proof)
→ searchPlayStore(keyword, markets)   ← parallel per market
→ vault JSONB patch: state_en.features.keyword_validator.signals.[kw].live_ranks.[market]
→ refundWorkspaceAiCredits on total failure
→ optimizer/sync fire-and-forget (invalidates AI Listing Optimizer Active Context)
```

---

## Synthesis Context Builder

`src/lib/staging/synthesis-context-builder.ts` reads from the correct locale branch:

```typescript
const state = locale === 'en' ? vault.state_en : vault.state_ar;
const features = state.features;
```

**Priority stack (6,000 token budget):**
1. High-confidence keywords (≥75%) — max 2,000 tokens
2. Medium-confidence keywords (50–75%) — max 1,500 tokens
3. Baseline snapshot metadata — max 1,000 tokens
4. Competitive intelligence — max 1,000 tokens
5. Review signals — max 500 tokens

---

## Safety Rules (Zero-Breaking-Changes)

| Rule | Enforcement |
|------|------------|
| Never hard-delete vault keys | Use `deleted_at` timestamp (soft-delete) |
| Never rename fields | Add new field, keep old as deprecated |
| Additive schema only | New fields must be optional with defaults |
| Producer isolation | `ProducerRegistry.verifyIsolation()` on every write |
| Locale isolation | `state_en` and `state_ar` never cross-written |
| No credit logic client-side | All billing via `consume_workspace_ai_credits` or `consume_modular_listing_regenerate` RPC (server) |
| Regenerate debits after success | Failed Zod validation on AI output must not consume trial slots or credits |
| Draft state | `useDraftPersistence` (localStorage) **and** `workspace_listing_drafts` (DB per `queue_hash`) — vault features namespace unchanged until finalize |

---

## Experiment Snapshots — Locale Parity (Fixed June 2026)

All experiment snapshot queries now filter by locale correctly.

**Service (`getSnapshots`):**
```typescript
if (filters?.language) {
  query = query.eq("listing->>language", filters.language);
}
```

**Route GET schema:**
```typescript
const getQuerySchema = z.object({
  appId: z.string().uuid(),
  type: z.enum(["baseline", "variant"]).optional(),
  language: z.enum(["en", "ar"]).optional(),   // ← added
});
```

**UI query keys (both components):**
```typescript
// experiment-history-panel.tsx
queryKey: ['baselines', workspaceId, selectedAppId, locale]

// experiment-snapshots-ui.tsx  
queryKey: ['experiments', appId, locale]
```

**POST bodies pass language:**
```typescript
body: JSON.stringify({
  action: 'create_baseline',
  appId: selectedAppId,
  language: locale,   // ← always explicit
})
```

---

## AI Listing Optimizer Integration (Updated June 12, 2026)

### Active Context UI

`StagingWorkspace` three pillars (labels updated):

| Pillar | Queue types |
|--------|-------------|
| **Review Insights** | `review_pain_point`, `feature_request` |
| **Keyword Gaps** | `keyword_gap`, `market_keyword` |
| **Competitor Strengths** | `competitor_strength`, `competitor_weakness` |

Components: `ListingOptimizer.tsx` → `StagingWorkspaceSection` → `StagingWorkspace.tsx`

### Hooks

```typescript
// Primary queue state (SSOT for pills / generation)
const { items, addItems, removeItem } = useOptimizationQueue(workspaceId, locale, appId);

// Optimizer context API (queue-backed activeItems)
const { data: optimizerContext } = useOptimizerSync(workspaceId, { vaultLocale: locale, appId });
```

### Synthesis

```typescript
buildSynthesisFromOptimizationQueue(queueItems) // optimization-queue-synthesis.ts
```

Prompt version: **`listing-optimizer-v12.0`** — instructs model to use **only** curated queue signals.

### Invalidation (after any queue mutation)

```typescript
queryClient.invalidateQueries({ queryKey: ['optimization-queue', workspaceId, locale, appId ?? ''] });
queryClient.invalidateQueries({ queryKey: ['optimizer-context', workspaceId, locale] });
dispatchStagingVaultChanged({ workspaceId, locale, appId }); // cross-tab sync
```

### Competitor Spy curation rules

- **No** auto-staging on page load
- **No** `setPlaystoreInjectedKeywordContext` / `localStorage` prefill to optimizer
- All send paths use `validateAndQueue()` — toast on failure, navigate only after successful POST
- `KeywordCurationModeProvider` + `KeywordSelectionProvider` in `WorkspaceAppProviders` (dashboard shell)

---

## Modular Listing Pipeline (Session 4–5 — June 16–22, 2026)

### Relationship to vault & queue

The modular pipeline **does not** write intermediate title/short/long blocks to the staging vault. Vault integration points:

| Stage | Vault / queue touchpoint |
|-------|--------------------------|
| **Active Context** | Queue items → `buildSynthesisFromOptimizationQueue()` → injected in `buildModularAppContextBlock()` |
| **Context Gateway** | `stampAndCompileListingContext()` stamps `workspace_keywords.queue_hash` + compiles step-scoped signals (not vault JSONB) |
| **Stale guard** | `validateActiveContextQueueHash` — 409 if queue changed since session started |
| **Finalize** | Persists full listing via existing listing save path (not vault features namespace) |
| **Draft recovery** | `workspace_listing_drafts` (DB, keyed by `queue_hash`) + `useDraftPersistence` (browser `localStorage`) |

### Async execution (Session 5)

The modular pipeline no longer runs entirely in one HTTP request:

```
POST /api/listings/generate  → 202 { jobId }  (producer: validate, phase read-check, enqueue)
POST /api/listings/worker    → QStash consumer (execute orchestrator + Gemini phases)
GET  /api/listings/status    → poll jobId until completed | failed
```

- **Redis lock** on `(workspaceId, queueHash)` prevents duplicate in-flight pipelines.
- **`isDraft: true`** remains synchronous on the producer (instant preview, no queue).
- **`WAITING_FOR_PHASES`** — producer returns 202 when finalize/regenerate requested before prerequisite phases are persisted in `workspace_listing_drafts`.

### Phase orchestration

```
Phase 1 (title)     → generationStep=title      → free (worker)
Phase 2 (short)     → generationStep=short      → free (typed variations schema)
Phase 3 (long)      → generationStep=long|…     → free first gen; regen billed post-success
Pipeline (all)      → generationStep=pipeline   → 5 credits post-success
Confirm (finalize)  → generationStep=finalize   → 5 credits post-success
```

**Regenerate:** `isRegenerate: true` → `consume_modular_listing_regenerate` **after** successful worker run.

### Trial-to-Paid regenerate billing

| `trial_regenerations_used` | Regenerate cost |
|----------------------------|-----------------|
| 0–2 (slots remaining) | Free — counter incremented |
| ≥ 3 | 1 credit (`modular_listing_regenerate`, `generation_type: text`) |

Column: `workspaces.trial_regenerations_used`  
Migration: `supabase/migrations/20260618120000_workspace_trial_regenerations.sql`

### Weighted credit registry

| Category | Tool | Credits | `generation_type` |
|----------|------|---------|-------------------|
| Text — modular regen | `modular_listing_regenerate` | 1 | `text` |
| Text — finalize | `listing_generation` | 5 | `text` |
| Media — Creative Bundle | `brand_kit_batch` | 30 | `media` |

Helper: `buildCreditLedgerMeta('text' | 'media', extra)` in `src/lib/features/billing/credit-ledger-meta.ts`

### Data integrity

**Short description (strict):**
```typescript
// src/lib/listing/modular-short-variations.ts
{ variations: [
  { type: 'growth' | 'conversion' | 'utility', text: string /* max 80 */ }
] } // length exactly 3, one of each type
```

- Gemini: `responseMimeType: "application/json"` + matching `responseSchema`
- Validation failure → API 400 `validation_error` + `fieldErrors` — **no** credit/trial debit
- No `padShortDescriptionVariations` generic fallback

**Draft vs finalize state:** `modularListingDraftStateSchema` vs `modularListingFinalizeStateSchema`

### Performance strategy

| Technique | Status |
|-----------|--------|
| Phased API calls (smaller prompts per step) | ✅ Implemented |
| JSON mode + `responseSchema` per step | ✅ Implemented |
| Single-attempt short generation (no retry loop) | ✅ Implemented |
| Post-success billing only | ✅ Implemented (worker debits after validation) |
| Async QStash worker | ✅ Implemented — producer 202 + status polling |
| Streaming partial responses to client | 🔜 Planned — target for 20s+ perceived latency |

**Key implementation files:**
```
app/api/listings/generate/route.ts          — QStash producer
app/api/listings/worker/route.ts            — QStash consumer
app/api/listings/status/route.ts            — job polling
src/hooks/useModularGeneration.ts
src/hooks/useDraftPersistence.ts
src/lib/listing/context-gateway.ts
src/lib/listing/sync-queue-hash.ts
src/lib/listing/listing-generation-executor.ts
src/lib/gemini/generate-listing-modular.ts
src/lib/listing/listing-generation-orchestrator.ts
src/lib/features/billing/modular-regenerate-billing.ts
src/lib/client/poll-listing-generation-status.ts
src/components/listing/optimizer/modular-listing-panel.tsx
```

---

## Context Gateway & Keyword Stamping (Session 5 — June 22, 2026)

The Context Gateway bridges the **Optimization Queue** (vault JSONB) and **Keyword Tracker** (relational `workspace_keywords`) without writing intermediate listing text to the vault.

### Components

| File | Function |
|------|----------|
| `src/lib/listing/sync-queue-hash.ts` | `syncQueueHash()` — stamps `queue_hash` on staged keyword rows for workspace + app (+ optional locale) |
| `src/lib/listing/context-gateway.ts` | `stampAndCompileListingContext()` — atomic stamp + `compileContextForStep()` |
| `src/lib/listing/modular-step-signals.ts` | Step-scoped signal selection (top 5 keywords; +2 competitor for long/full) |

### Gate

Zero staged keywords after compile → `400 KEYWORD_CONTEXT_REQUIRED` with message: *"ASO optimization requires staged keyword signals. Please add keywords to your Tracker first."*

### Database

```sql
-- workspace_keywords (existing table, new column usage)
queue_hash TEXT NULL   -- 64-char hex, set by syncQueueHash
-- Index: workspace_keywords_queue_hash_idx (migration 20260622150000)
```

```sql
-- workspace_listing_drafts (migration 20260621130000 + 20260622180000)
UNIQUE (workspace_id, queue_hash)
job_id UUID
generation_status TEXT  -- pending | processing | completed | failed
generation_error TEXT
current_phase TEXT
generation_payload JSONB
generation_result JSONB
vault_locale TEXT       -- en | ar
```

Draft rows are the **job store** for async generation — one row per active queue hash per workspace.

---

## Billing Observability (Session 5)

| Surface | Backend |
|---------|---------|
| Phase breakdown chart (Settings) | `GET /api/billing/usage-breakdown` → `listing_generation_costs` |
| Ranking impact chip | `GET /api/workspaces/:id/keywords/ranking-impact` |
| Monthly credit cap | `workspaces.monthly_credit_cap` + `credit_budget_warning` at 80% |
| Credit dashboard donut/trend | `GET /api/workspaces/:id/billing/usage-summary` |

Migration: `20260622160000_add_listing_generation_costs.sql`, `20260622170000_workspace_monthly_credit_cap.sql`

---

## Vault Router

`src/lib/staging/vault-router.ts` — provides `getVault(workspaceId, appId)` and `saveVault(vault)`.

⚠️ **Do not import `vaultRouter` in Next.js route handlers under `app/api/`** — it transitively imports `producer-registry.ts` which has dynamic imports to producer files. Webpack tries to resolve these during static path generation and crashes the page bundle. Use direct Supabase queries instead.

---

## Migration History

48+ migrations — core vault + listing pipeline migrations:

| Migration | Purpose |
|-----------|---------|
| `20260604100100_workspace_staging_vault.sql` | Legacy signal-log schema (may exist as `workspace_signal_log` after rename) |
| `20260610000000_universal_staged_state_architecture.sql` | Universal vault: `state_en`, `state_ar`, `app_id` |
| `20260612100000_drop_vault_features_btree_indexes.sql` | **Required** — drops btree feature indexes that break large JSONB writes |
| `20260618120000_workspace_trial_regenerations.sql` | `trial_regenerations_used` + `consume_modular_listing_regenerate` RPC |
| `20260621130000_workspace_listing_drafts.sql` | Draft persistence keyed by `(workspace_id, queue_hash)` |
| `20260622150000_add_queue_hash_index.sql` | B-tree index on `workspace_keywords.queue_hash` |
| `20260622160000_add_listing_generation_costs.sql` | Per-phase token/credit telemetry |
| `20260622170000_workspace_monthly_credit_cap.sql` | User-defined monthly budget cap |
| `20260622180000_listing_generation_job_status.sql` | Async job columns on `workspace_listing_drafts` |

The universal vault migration (`20260610000000`) was applied manually in some environments before being recorded. The old signal-log table was renamed to `workspace_signal_log` where conflicts occurred.

**`CREATE TABLE IF NOT EXISTS` caveat:** whichever migration ran first wins — production may have **only** universal columns (no `metadata`, `signal_type`). All vault code must use schema probes, not assumptions.

**To verify:**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'workspace_staging_vault'
ORDER BY ordinal_position;
-- Should return 12 columns: id, workspace_id, app_id, state_en, state_ar,
-- created_at, updated_at, deleted_at, last_modified_by, change_count,
-- active_features, is_deleted
```

---

## Summary Table (Updated June 22, 2026)

| Aspect | Rule | Enforcement |
|--------|------|-------------|
| **Optimization Queue SSOT** | Only queued signals feed Active Context + Generate | `flattenQueueToActiveItems()`, `buildSynthesisFromOptimizationQueue()` |
| **Context Gateway** | Staged keywords required; stamp before generate | `stampAndCompileListingContext()`, `syncQueueHash()` |
| **Async generation** | Producer enqueues; worker executes | QStash + `workspace_listing_drafts.generation_status` |
| **Phase guard (read)** | Missing prerequisites → 202 WAITING_FOR_PHASES | `checkModularPhaseOrder()` on producer |
| **Queue-hash lock** | One in-flight pipeline per hash | Redis `SET NX` in `generation-queue-hash-lock.ts` |
| **Vault writes** | All INSERT/UPDATE via VaultCore | `VaultCore.safeUpsert()` / `safeUpdate()` |
| **Schema awareness** | Probe before legacy/universal paths | `hasLegacySignalColumns()`, `hasUniversalVaultColumns()` |
| **Producer Isolation** | One feature, one boundary | `ProducerRegistry.verifyIsolation()` (stubs) |
| **Locale Isolation** | EN and AR never cross-written | `stateKey = locale === 'ar' ? 'state_ar' : 'state_en'` |
| **Queue dedup** | Same type + normalized content | `queueDedupeKey()` in optimization-queue.service |
| **Index safety** | No btree on `features` JSONB subtree | GIN on full `state_en`/`state_ar` only |
| **Curation before synthesis** | No auto-dump from discovery | `validateAndQueue()`, no localStorage keyword injection |
| **Soft Delete** | Never hard-delete vault rows | `deleted_at` / `is_deleted` |
| **Credits** | Server-side only, RPC atomic | Post-success in worker; `consume_workspace_ai_credits` for sync routes |
| **React Query** | Locale + appId in queue keys | Prevents EN/AR cache contamination |
| **AI transport** | Vertex AI via modelGateway | `getGenerativeModel()` — not `GEMINI_API_KEY` REST for new routes |

---

## Session 3 Bug Reference

| Symptom | Fix location |
|---------|--------------|
| `No writable vault schema detected` | `vault-core.ts` universal feature signal path |
| `column metadata does not exist` | `read-competitor-keywords.ts` |
| `index row size exceeds btree maximum` | migration `20260612100000` |
| Sentiment 500 after AI success | `competitors/sentiment/route.ts` — result shadowing + Vertex AI |
| Queue empty after navigation | `validate-and-queue.ts` + `WorkspaceAppProviders` |

## Session 5 Bug Reference

| Symptom | Fix location |
|---------|--------------|
| `ModularPhaseOrderError` → 500 on generate | Producer uses `checkModularPhaseOrder()` + 202 `WAITING_FOR_PHASES`; worker uses `assertModularPhaseOrder()` |
| Duplicate in-flight pipelines | Redis queue-hash lock on producer; released in worker `finally` |
| Vercel timeout on full pipeline | QStash producer/worker split |

---

**End of Document**

**Version:** 5.0  
**Last Updated:** June 22, 2026  
**Scope:** Growth Hub Staging Vault + Optimization Queue + Async Modular Pipeline  
**Status:** Production Reference
