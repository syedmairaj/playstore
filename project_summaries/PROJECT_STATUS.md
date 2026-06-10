# Growth Hub - Project Status & Architecture Reference

**Last Updated:** June 10, 2026  
**Project Phase:** Production - Active Development  
**Status:** 🟢 Stable with Active Enhancements  

---

## Executive Summary

Growth Hub is a **pro-grade ASO (App Store Optimization) platform** built on modern cloud-native architecture. The platform leverages a **Staged-State architecture** pattern for feature isolation, workspace-scoped data management, and zero-breaking-changes deployment strategy.

**Core Mission:** Enable indie app developers to optimize their Google Play Store listings through AI-powered keyword validation, experiment snapshots, and synthesis-driven improvements.

---

## Technology Stack

### Frontend
- **Framework:** Next.js 15+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS with dark mode
- **Internationalization:** next-intl (EN/AR bilingual)
- **State Management:** React Query (TanStack Query)
- **UI Components:** Shadcn/ui + Lucide icons
- **RTL Support:** CSS logical properties

### Backend
- **Runtime:** Node.js (Next.js API routes)
- **Database:** Supabase PostgreSQL
- **ORM:** Supabase Client SDK
- **Authentication:** Supabase Auth (JWT-based)
- **API:** REST endpoints with server-side validation

### Infrastructure
- **Deployment:** Vercel
- **Database:** Supabase (cloud)
- **Real-time:** Supabase Realtime subscriptions
- **Storage:** Supabase Storage

---

## Staged-State Architecture Pattern

### Universal Staging Vault

**Purpose:** Single source of truth for all keyword and synthesis data with strict bilingual isolation.

**Schema:**
```sql
CREATE TABLE workspace_staging_vault (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  state_en JSONB,           -- English state
  state_ar JSONB,           -- Arabic state
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  last_modified_by UUID,
  change_count INTEGER,
  deleted_at TIMESTAMP NULL,
  is_deleted BOOLEAN DEFAULT false,
  active_features TEXT[]
);
```

### Producer Pattern (Feature Isolation)

Each feature registers as a Producer with exclusive state ownership:

1. **KeywordValidatorProducer** → Keyword viability scores
2. **ExperimentSnapshotsProducer** → Baseline snapshots & variants
3. **ASOSynthesizerProducer** → Synthesis context & outputs

**Rules:**
- Producer owns its feature state exclusively
- Cross-feature reads allowed; writes forbidden
- ProducerRegistry.verifyIsolation() enforces boundaries

### Data Lifecycle Rules

#### Producer Rule (Isolation)
- Only the owning producer can write to its feature state
- Isolation violations throw IsolationViolationError
- Changes tracked per feature in active_features array

#### Synthesis Rule (Context-Aware)
- ASOSynthesizerService reads from vault in priority:
  1. High-confidence keywords (≥75%)
  2. Medium-confidence keywords (50-75%)
  3. Baseline snapshot metadata
  4. Competitive intelligence
  5. Review signals
- Token budget: 6,000 max (auto-truncation)

#### Safety Rule (No Breaking Changes)
- Never delete vault keys
- Soft-delete only: add deleted_at timestamp
- All changes backwards-compatible
- Schema evolution additive only

---

## Completed Modules

### 1. Keyword Validator ✅

**Status:** Production Ready

**Components:**
- `src/components/keyword-tracker/keyword-validator-drawer.tsx` (450 lines)
- `app/[locale]/app/[workspaceId]/validator/page.tsx` (standalone pro UI)

**Features:**
- Real-time keyword viability scoring (0-10 scale)
- Confidence intervals (0-100%)
- Monthly installs projection
- Search volume & competition analysis
- Heuristic-based recommendations
- Color-coded progress bars (red/amber/green)
- Tier badges with Lucide icons
- Full RTL bilingual support

**API Endpoint:**
- `POST /api/workspaces/{id}/validator/validate-keyword`

**Integration:**
- Standalone page accessible from menu
- Results staged in workspace_staging_vault
- Bilingual EN/AR with automatic layout mirroring

---

### 2. Experiment Snapshots ✅

**Status:** Service Complete, UI Integration Complete

**Components:**
- `src/lib/experiment/experiment-snapshots-service.ts` (500 lines)
- `src/components/listing-optimizer/experiment-history-panel.tsx` (520 lines)

**Features:**
- Baseline snapshot creation
- Variant management (A/B testing)
- Weekly metrics recording
- Performance comparison
- Soft-delete with recovery
- Tabbed interface (Baseline | History)
- Expandable details

**API Endpoints:**
- `GET /api/workspaces/{id}/experiments/snapshots`
- `POST /api/workspaces/{id}/experiments/snapshots`

**Integration:**
- Accessed from AI Listing Optimizer page
- Two-tab interface (Current Baseline | Experiment History)
- Data persisted to workspace_staging_vault

---

### 3. Enhanced Synthesis (ASO Synthesizer) ✅

**Status:** Production Ready

**Components:**
- `src/lib/synthesis/aso-synthesizer-service.ts` (400 lines)
- `src/lib/staging/synthesis-context-builder.ts` (250 lines)

**Features:**
- Constraint-aware listing generation
- High-confidence keyword prioritization
- Baseline snapshot awareness
- Framing validation
- Token-aware context extraction
- Expectation management via language

**Integration:**
- Auto-enhanced in "Generate Full Listing"
- Consumes vault via SynthesisContextBuilder
- Calls Gemini 2.5-Flash LLM
- Results staged for review

---

## UI Integration Status

### Navigation Structure
```
PlayStore Menu
├─ Home
├─ Keyword Tracker
├─ Keyword Validator Pro ← NEW standalone page
├─ AI Listing Optimizer
├─ Brand Assets
├─ Competitor Spy
├─ Reviews
├─ Market Intel
├─ Alerts
└─ Settings
```

### Component Status

| Component | Type | Status |
|-----------|------|--------|
| Keyword Validator | Standalone page + Drawer | ✅ Complete |
| Experiment Snapshots | Tabbed panel | ✅ Complete |
| Enhanced Synthesis | Auto-enhanced | ✅ Complete |

---

## Bilingual & RTL Architecture

### CSS Logical Properties
```css
margin-inline-start    /* Left in LTR, Right in RTL */
margin-inline-end      /* Right in LTR, Left in RTL */
padding-block-start    /* Top in both */
padding-block-end      /* Bottom in both */
text-align: start      /* Left in LTR, Right in RTL */
```

### Bilingual Data Model
```typescript
{
  state_en: {
    keywords: [...],
    snapshots: [...],
    synthesis_context: {...}
  },
  state_ar: {
    keywords: [...],
    snapshots: [...],
    synthesis_context: {...}
  }
}
```

### Language Detection
```typescript
const locale = useLocale();  // 'en' or 'ar'
const isArabic = locale === 'ar';

<div dir={isArabic ? 'rtl' : 'ltr'}>
  {/* Automatic layout mirroring */}
</div>
```

---

## Zero-Breaking-Changes Strategy

### Core Rules

1. **Never Delete Vault Keys**
   - Use soft-delete: add deleted_at timestamp
   - Old clients see archived as non-deleted

2. **Never Rename Vault Fields**
   - Create new field, keep old (deprecated)
   - Gradual migration over releases

3. **Additive Schema Evolution**
   - Only add new columns/properties
   - All new fields nullable with defaults
   - Existing data continues working

4. **Feature Flag Gating**
   - New features behind feature flags
   - Rollout: 10% → 50% → 100%
   - Instant rollback capability

### Deployment Process

- Code pushed to staging
- Feature flags disabled by default
- Canary rollout to 10% of users
- Monitor error rates & metrics
- Expand to 100% after 24h with no issues

---

## Known Limitations

| Issue | Impact | Planned Solution |
|-------|--------|-----------------|
| Manual metric entry | Users record installs weekly | Google Play API sync |
| Heuristic scoring | Estimates, not real data | Serper API integration |
| 6K token limit | Context may truncate | Extended context windows |
| No statistical testing | Can't validate variant wins | Chi-square calculations |
| No auto-publish | Manual play store upload | Google Play Developer API |

---

## Database Schema

### Primary Tables

**workspace_staging_vault**
- All keyword/snapshot/synthesis data
- JSONB bilingual state
- Audit trail (created_at, updated_at, change_count)
- Soft delete (deleted_at, is_deleted)

**keyword_viability_scores**
- Cache of computed scores
- Prevents recalculation
- Confidence intervals

**experiment_snapshots**
- Baseline snapshots
- Variant snapshots
- Weekly metrics
- Performance data

**workspaces**
- Metadata
- AI credits
- Feature flags
- Plan info

---

## Troubleshooting

### Build Cache Issues
```bash
rm -rf .next
npm cache clean --force
npm run dev
```

### RTL Layout Breaks
**Cause:** Hard-coded left/right instead of logical properties  
**Fix:** Use `margin-inline-start/end` instead of `margin-left/right`

### Missing Bilingual Content
**Cause:** Missing Arabic translations  
**Fix:** Check `messages/ar.json` matches `messages/en.json`

### API Endpoint 404
**Cause:** File structure mismatch  
**Fix:** Verify exact path: `app/api/workspaces/[workspaceId]/validator/validate-keyword/route.ts`

---

**Version:** 1.0 (Production)  
**Last Updated:** June 10, 2026  
**Status:** Ready for Development
