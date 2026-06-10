# Staging Vault Integration Summary

**Document Version:** 2.0  
**Last Updated:** June 10, 2026  
**Scope:** Growth Hub Staged-State Architecture Pattern  
**Audience:** Senior developers, architects, future maintainers  

---

## Executive Overview

The **Staging Vault** is the architectural foundation of Growth Hub. It implements a **Producer-Consumer pattern** with strict feature isolation, bilingual state separation, and zero-breaking-changes evolution semantics.

**Core Value:** Enables unlimited feature scaling without cross-feature data corruption while maintaining backwards compatibility across all client versions.

**Key facts for new sessions:**
- Dashboard is **English-only** — Arabic locale is set on the landing page, not inside the authenticated shell
- `workspace_staging_vault` is a **different table** from `workspace_signal_log` (the old signal-log, renamed)
- All 43 migrations are reconciled — `npx supabase migration list` shows all applied
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

**Active indexes:**
```
idx_vault_workspace_app       — (workspace_id, app_id)
idx_vault_active_features     — GIN on active_features
idx_vault_updated_at          — (updated_at DESC)
idx_vault_not_deleted         — (is_deleted, workspace_id)
idx_vault_state_en            — GIN on state_en
idx_vault_state_ar            — GIN on state_ar
idx_vault_state_en_features   — (state_en -> 'features')
idx_vault_state_ar_features   — (state_ar -> 'features')
```

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

| Feature key | Owner producer | Data written |
|-------------|---------------|-------------|
| `keyword_validator` | `KeywordValidatorProducer` | `signals.[keyword].live_ranks.[market]` |
| `keyword_tracker` | `KeywordTrackerProducer` | tracked keywords + rank snapshots |
| `experiment_snapshots` | `ExperimentSnapshotsProducer` | baselines + variants |
| `competitor_spy` | `CompetitorSpyProducer` | competitor keyword gaps |
| `review_analysis` | `ReviewAnalysisProducer` | review themes + signals |

---

## Complete JSONB Example

```json
{
  "state_en": {
    "metadata": { "locale": "en", "schema_version": "1.0" },
    "features": {
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
| No credit logic client-side | All billing via `consume_workspace_ai_credits` RPC (server) |

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

## AI Listing Optimizer Integration

The Optimizer's Active Context uses `useOptimizerSync(workspaceId)` which polls `['optimizer-context', workspaceId]`.

**Auto-refresh trigger (KeywordValidatorCard):**
```typescript
void queryClient.invalidateQueries({
  queryKey: ['optimizer-context', workspaceId]
});
```

Called after:
1. Keyword staged to tracker
2. Live rank fetch completes

This causes the Optimizer's Active Context panel to re-render automatically without any user action.

---

## Vault Router

`src/lib/staging/vault-router.ts` — provides `getVault(workspaceId, appId)` and `saveVault(vault)`.

⚠️ **Do not import `vaultRouter` in Next.js route handlers under `app/api/`** — it transitively imports `producer-registry.ts` which has dynamic imports to producer files. Webpack tries to resolve these during static path generation and crashes the page bundle. Use direct Supabase queries instead.

---

## Migration History

43 migrations — all reconciled with `npx supabase migration repair --status applied`.

The `workspace_staging_vault` migration (`20260610000000_universal_staged_state_architecture.sql`) was applied manually before being recorded. The old `workspace_staging_vault` (signal-log schema) was renamed to `workspace_signal_log` before the new dual-state table was created.

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

## Summary Table (Updated)

| Aspect | Rule | Enforcement |
|--------|------|-------------|
| **Producer Isolation** | One feature, one boundary | `ProducerRegistry.verifyIsolation()` |
| **Locale Isolation** | EN and AR never cross-written | `stateKey = locale === 'ar' ? 'state_ar' : 'state_en'` |
| **Synthesis Priority** | Keywords → Snapshots → Competitors → Reviews | `SynthesisContextBuilder` priority stack |
| **Token Budget** | Max 6,000 tokens per generation | Auto-truncation in `contextBuilder` |
| **Soft Delete** | Never hard-delete, use `deleted_at` | Soft-delete pattern on all entities |
| **Additive Evolution** | Never rename/delete fields | Schema review before deploy |
| **Feature Flags** | Guard new features | Gradual rollout: 10% → 50% → 100% |
| **Credits** | Server-side only, RPC atomic | `consume_workspace_ai_credits` SELECT FOR UPDATE |
| **Live Rank** | Per-market, scaled credits | `serperAiCreditsForCountryCount(markets.length)` |
| **React Query** | Locale in every queryKey | Prevents EN/AR cache contamination |

---

**End of Document**

**Version:** 2.0  
**Last Updated:** June 10, 2026  
**Scope:** Growth Hub Staging Vault Architecture  
**Status:** Production Reference
