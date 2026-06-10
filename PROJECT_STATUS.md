# Growth Hub - Project Status & Architecture Reference

**Last Updated:** June 10, 2026  
**Project Phase:** Production - Active Development  
**Status:** 🟢 Stable with Active Enhancements  
**Session:** Post-session 2 (Keyword Validator overhaul, live rank, vault migration, parity fixes)

---

## Executive Summary

Growth Hub is a **pro-grade ASO (App Store Optimization) platform** built on modern cloud-native architecture. The platform leverages a **Staged-State architecture** pattern for feature isolation, workspace-scoped data management, and zero-breaking-changes deployment strategy.

**Core Mission:** Enable indie app developers to optimize their Google Play Store listings through AI-powered keyword validation, experiment snapshots, and synthesis-driven improvements.

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

### Infrastructure
- **Deployment:** Vercel
- **Database:** Supabase (cloud) — 43 migrations, all reconciled
- **CLI:** Supabase CLI v2.90.0 (update to v2.105.0 recommended)

---

## Critical Architectural Decisions Made This Session

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

### 2. Experiment Snapshots ✅ (locale parity fixed this session)

**Status:** Production Ready

**Files:**
- `src/lib/experiment/experiment-snapshots-service.ts`
- `src/components/listing-optimizer/experiment-history-panel.tsx`
- `src/components/experiments/experiment-snapshots-ui.tsx`
- `src/components/experiments/experiment-snapshots-page.tsx`

**Parity fixes applied:**
- `getSnapshots()` now applies `.eq("listing->>language", filters.language)` — previously accepted `language` filter but never applied it
- GET route schema now accepts `?language=en|ar` and forwards it to the service
- `queryKey` in all UI components includes `locale` — EN and AR users no longer share cached results
- `createBaseline` and `createVariant` POST bodies now pass `language: locale`
- `text-right` → `text-end` (CSS logical property) across all experiment UI files

---

### 3. Enhanced Synthesis (ASO Synthesizer) ✅

**Status:** Production Ready — unchanged this session

**Components:**
- `src/lib/synthesis/aso-synthesizer-service.ts`
- `src/lib/staging/synthesis-context-builder.ts`

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
| Enhanced Synthesis | Auto-enhanced | ✅ Complete |
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

## Optimizer Integration

The AI Listing Optimizer's Active Context panel (`useOptimizerSync` hook) uses query key `['optimizer-context', workspaceId]`. After every `KeywordValidatorCard` staging or live rank fetch, the component calls:

```typescript
void queryClient.invalidateQueries({ queryKey: ['optimizer-context', workspaceId] });
```

This triggers an automatic refetch of `/api/workspaces/{id}/optimizer/context`, re-rendering the Active Context without any manual refresh.

---

## Known Bugs Fixed This Session

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
| Producer stubs only | `initializeDefaultProducers()` not functional | Implement each producer with real vault logic |
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

---

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

---

**Version:** 2.0  
**Last Updated:** June 10, 2026  
**Status:** Production — Active Development
