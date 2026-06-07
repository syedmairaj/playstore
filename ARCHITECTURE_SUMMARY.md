# ASO Workbench Architecture Summary - Unified Language-Aware Staging

**Status:** 🚀 Complete Refactoring Architecture Ready  
**Date:** June 7, 2026  
**Scope:** Standardize all staging operations across all feature modules

---

## The Core Problem We're Solving

### Current State (Pre-Refactoring)
```
Every feature module (Competitor Spy, Review Insights, Keyword Tracker, etc.) has:
❌ Custom payload construction logic
❌ Duplicate language/RTL detection code
❌ Separate staging button components
❌ No consistent pattern for new features
❌ Risk of subtle bugs due to inconsistency
```

### The Solution
```
Single source of truth for:
✅ Language-aware payload contract (UnifiedStagingPayload)
✅ Centralized staging logic (useStaging hook)
✅ Reusable utilities (builders, validators, filters)
✅ Universal button component (StagingButton)
✅ Automatic EN/AR + RTL support everywhere
```

---

## The 4-Layer Architecture

### Layer 1: Contract (Types)
**File:** `types/staging-contract.ts`

Defines the rules all payloads must follow:
```typescript
interface UnifiedStagingPayload {
  source: string;              // Module identifier
  category: string;            // Signal category
  intent: string;              // Signal type
  content_array: (string|object)[]; // Main data
  lang: 'en' | 'ar';          // CRITICAL: Language
  is_rtl: boolean;            // Computed from lang
  metadata?: Record<string, any>;
  // ... other optional fields ...
}
```

**Why This Matters:**
- All modules build payloads using the same interface
- TypeScript ensures compliance
- Future features automatically follow the pattern
- Database schema is known in advance

---

### Layer 2: Hook (Orchestration)
**File:** `hooks/useStaging.ts`

Centralized React hook that handles:
```typescript
const { 
  stage,           // Async function to stage a payload
  loading,         // Is API call in progress?
  staged,          // Was staging successful?
  error,           // Error message if failed
  reset,           // Reset states for retry
  language,        // User's language (from useLocale)
  isRtl            // Computed: true if lang === 'ar'
} = useStaging();

// Usage:
const payload = buildCompetitorSpyPayload(...);
await stage(payload);
```

**Why This Matters:**
- Single source of truth for staging logic
- If API changes, only this file needs updating
- Toast notifications automatically bilingual
- State machine (idle → loading → staged) unified
- All components get consistent behavior

---

### Layer 3: Utilities (Pure Functions)
**File:** `lib/staging-utilities.ts`

Reusable helpers for:

**Builders:**
```typescript
buildCompetitorSpyPayload(name, keywords, metadata, lang)
buildReviewAnalysisPayload(issues, metadata, lang)
buildKeywordTrackerPayload(keywords, metadata, lang)
```

**Validators:**
```typescript
validatePayload(payload)
validateContentArray(array)
validateLanguage(lang)
```

**Transformers:**
```typescript
sanitizeContent(array)
deduplicateContent(array)
extractKeywords(array)
```

**Filters (For AI Optimizer Retrieval):**
```typescript
filterByLanguage(records, 'en' | 'ar')
filterBySignalType(records, 'competitor_weakness')
filterBySource(records, 'competitor_spy')
filterByMultiple(records, { lang, signalType, source })
```

**Why This Matters:**
- No logic duplication across components
- Pure functions = easy to test
- Easy to add new builders for new features
- Filtering ensures language-specific data purity

---

### Layer 4: Component (UI)
**File:** `components/staging/StagingButton.tsx`

Universal button that renders:
```typescript
<StagingButton
  payload={payload}           // UnifiedStagingPayload
  variant="primary"           // primary | secondary | ghost | outline
  size="md"                   // sm | md | lg
  onStaged={() => {}}         // Callback after success
  label="Add to Queue"        // Optional custom label
/>
```

**Features:**
- Automatically detects language via hook
- Applies RTL when `lang === 'ar'`
- State machine: idle → loading → staged
- Bilingual labels and toasts
- No logic needed in consuming component

**Why This Matters:**
- Replaces 5+ specialized buttons with one
- Consistent UI/UX across all modules
- Easy to customize (variants, sizes)
- Reduces component maintenance burden

---

## Data Flow: End-to-End

### Example: Competitor Spy Module

```
┌─────────────────────────────────────────────────────────────┐
│ 1. COMPONENT: CompetitorSpySnapshotCard                     │
│    - Has: competitor name, keywords, category, ranking      │
│    - Gets: language from useLocale()                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. BUILDER: buildCompetitorSpyPayload()                     │
│    Input:  'FitTrack Pro', ['fitness', 'health', ...], 'ar'│
│    Output: UnifiedStagingPayload {                          │
│      source: 'competitor_spy',                              │
│      category: 'competitor_weakness',                       │
│      intent: 'competitor_weakness',                         │
│      content_array: [...keywords...],                       │
│      lang: 'ar',                                            │
│      is_rtl: true,                                          │
│      metadata: { ... }                                      │
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. BUTTON: <StagingButton payload={payload} />             │
│    - Renders: dir="rtl" flex-row-reverse (Arabic)          │
│    - Text: "إضافة إلى الخزنة" (Arabic auto-detected)       │
│    - User clicks button                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. HOOK: useStaging().stage(payload)                        │
│    - Validates: validateStagingPayload(payload)             │
│    - Transforms: transformToVaultRecord(payload)            │
│    - API Call: POST /api/workspaces/staging/add             │
│    - Sets: loading=true → loading=false                     │
│    - Triggered: staged=true → toast notification            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. DATABASE: workspace_staging_vault                         │
│    INSERT {                                                 │
│      signal_type: 'competitor_weakness',                    │
│      source: 'competitor_spy',                              │
│      source_context: 'competitor_weakness',                 │
│      content: '[..keywords..]',     (JSON string)           │
│      metadata: { ... },             (JSONB)                 │
│      language: 'ar',                (KEY!)                  │
│      created_at: timestamp                                  │
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. AI OPTIMIZER: Retrieval with Language Filter             │
│    GET /api/signals?workspace=...&lang=ar                   │
│                                                             │
│    const signals = await fetchSignals(workspaceId);         │
│    const arSignals = filterByLanguage(signals, 'ar');       │
│                                                             │
│    Result: Only Arabic-language signals shown               │
│    ✅ Data purity: No EN keywords in AR analysis            │
│    ✅ Better AI: Language-specific recommendations          │
└─────────────────────────────────────────────────────────────┘
```

---

## Language & RTL Flow

### Automatic Detection

```typescript
// Component just needs:
const language = useLocale() as LanguageCode; // 'en' or 'ar'

// Hook automatically:
const { language, isRtl } = useStaging();
// language = 'en' or 'ar'
// isRtl = false for 'en', true for 'ar'

// Button automatically:
<StagingButton payload={payload} />
// Renders dir="rtl" if lang === 'ar'
// Shows Arabic labels if lang === 'ar'
// Shows Arabic toast if lang === 'ar'
```

### No Manual RTL Logic Needed

```typescript
// ❌ OLD (Manual, repeated across components):
const isRtl = ['ar', 'he', 'fa', 'ur'].includes(language);
const buttonClass = cn('flex gap-2', isRtl && 'flex-row-reverse');
const dir = isRtl ? 'rtl' : 'ltr';

// ✅ NEW (Automatic, handled by StagingButton):
<StagingButton payload={payload} />
// All RTL/LTR logic inside component
```

---

## Key Design Decisions

### Decision 1: Unified Payload Contract

**Why:** Without a contract, each module invents its own payload structure, leading to:
- Inconsistency
- Harder to validate
- Risk of missing required fields
- Difficult to filter/query in database

**Solution:** `UnifiedStagingPayload` interface that ALL modules conform to.

---

### Decision 2: Language as First-Class Field

**Why:** Language affects:
- UI rendering (RTL vs LTR)
- AI Optimizer strategy selection
- Keyword/strategy appropriateness
- Database filtering

**Solution:** `lang: 'en' | 'ar'` is **required** in every payload.

---

### Decision 3: Centralized Hook (useStaging)

**Why:** Without centralization:
- 5+ copies of API call logic
- 5+ copies of error handling
- 5+ copies of toast notification logic
- If API changes, update 5+ files
- Risk of inconsistency

**Solution:** Single `useStaging()` hook that handles everything.

---

### Decision 4: Pure Utility Functions

**Why:** Builders and validators should be:
- Testable (no side effects)
- Reusable (used in components, hooks, tests)
- Flexible (work with different data sources)

**Solution:** Pure functions in `staging-utilities.ts` with clear inputs/outputs.

---

### Decision 5: Filtering by Language in AI Optimizer

**Why:**
- English keywords != Arabic keywords
- English strategy != Arabic strategy
- Mixing languages = worse AI recommendations
- Database supports it natively (language field)

**Solution:** AI Optimizer always calls `filterByLanguage()` when retrieving signals.

---

## Testing Strategy

### Unit Tests

Test each pure function independently:

```typescript
// Test builder
const payload = buildCompetitorSpyPayload(
  'TestApp', ['kw1', 'kw2'], {}, 'en'
);
expect(payload.lang).toBe('en');
expect(payload.is_rtl).toBe(false);

// Test validator
const result = validateStagingPayload(payload);
expect(result.valid).toBe(true);

// Test filter
const signals = [...]; // Sample data
const filtered = filterByLanguage(signals, 'ar');
expect(filtered.every(s => s.language === 'ar')).toBe(true);
```

### Integration Tests

Test component + hook interaction:

```typescript
// Render component with payload
const { getByRole } = render(
  <CompetitorSpySnapshotCard {...props} />
);

// Click staging button
fireEvent.click(getByRole('button', { name: /add to queue/i }));

// Verify:
// 1. Button shows loading state
// 2. API called with correct payload
// 3. Database record created
// 4. Toast notification shown
// 5. Button shows "staged" state
```

### E2E Tests

Test full user flow:

```typescript
// 1. User in Arabic
// 2. Opens Competitor Spy
// 3. Clicks "Add to Queue"
// 4. Sees Arabic toast
// 5. Opens AI Optimizer
// 6. Sees signal in Arabic-only view
// 7. Switches to English
// 8. Signal disappears (correctly filtered out)
```

---

## Common Integration Patterns

### Pattern 1: Basic Staging (Most Common)

```typescript
import { StagingButton } from '@/components/staging/StagingButton';
import { buildCompetitorSpyPayload } from '@/lib/staging-utilities';
import { useLocale } from 'next-intl';

export function MyModule() {
  const language = useLocale() as 'en' | 'ar';
  
  const payload = buildCompetitorSpyPayload(
    competitorName,
    keywords,
    metadata,
    language
  );

  return <StagingButton payload={payload} />;
}
```

**Lines of Code:** ~15  
**Reusable Patterns:** ✅  
**Language-Ready:** ✅ Automatic

---

### Pattern 2: Async Payload

```typescript
<StagingButtonAsync
  getPayload={async () => {
    const data = await fetchKeywords();
    const keywords = data.map(k => k.name);
    return buildCompetitorSpyPayload(..., language);
  }}
/>
```

---

### Pattern 3: Batch Staging

```typescript
const { stageBatch } = useStagingBatch();

const payloads = competitors.map(c =>
  buildCompetitorSpyPayload(c.name, c.keywords, {}, language)
);

const results = await stageBatch(payloads);
results.forEach((r, i) => {
  console.log(`Competitor ${i}: ${r.status}`);
});
```

---

### Pattern 4: AI Optimizer Retrieval

```typescript
import { filterByLanguage, filterBySignalType } from '@/lib/staging-utilities';

export function AIListingOptimizer() {
  const language = useLocale() as 'en' | 'ar';

  // Get all signals
  const allSignals = await fetchSignals(workspaceId);

  // Filter by language (CRITICAL!)
  const relevantSignals = filterByLanguage(allSignals, language);

  // Optional: Further filter by type
  const competitorSignals = filterBySignalType(
    relevantSignals,
    'competitor_weakness'
  );

  // Now process competitorSignals with confidence
  // they're all in the user's language
}
```

---

## Migration Roadmap

### Phase 1 (Week 1): Core Infrastructure
- [x] Create `types/staging-contract.ts`
- [x] Create `hooks/useStaging.ts`
- [x] Create `lib/staging-utilities.ts`
- [x] Create `components/staging/StagingButton.tsx`

### Phase 2 (Week 2): Module Refactoring
- [ ] Refactor Competitor Spy
- [ ] Refactor Review Insights
- [ ] Refactor Market Intelligence
- [ ] Refactor Keyword Tracker
- [ ] Refactor Alerts

### Phase 3 (Week 3): AI Optimizer Integration
- [ ] Add language-based filtering
- [ ] Test EN/AR data separation
- [ ] Test signal retrieval

### Phase 4 (Week 4): Testing & Documentation
- [ ] Unit test all utilities
- [ ] Integration tests for each module
- [ ] E2E tests (EN and AR)
- [ ] Update internal docs
- [ ] Train team on new patterns

---

## Success Metrics

After complete implementation, you should achieve:

| Metric | Before | After |
|--------|--------|-------|
| **Lines of staging code per module** | 150-200 | 20-30 |
| **Staging button components** | 5+ | 1 |
| **Code duplication** | High | None |
| **Time to add new feature** | 2-3 hours | 30 mins |
| **Consistency** | Variable | 100% |
| **EN/AR support** | Manual per module | Automatic |
| **Type safety** | Low | High |
| **Testability** | Hard | Easy |

---

## Troubleshooting Guide

### Problem: "Button doesn't know my language"

**Cause:** Component not detecting language from `useLocale()`

**Fix:**
```typescript
const language = useLocale() as LanguageCode;
const payload = buildCompetitorSpyPayload(..., language);
```

---

### Problem: "Arabic signals appearing in English view"

**Cause:** AI Optimizer not filtering by language

**Fix:**
```typescript
const relevantSignals = filterByLanguage(allSignals, userLanguage);
```

---

### Problem: "RTL layout not working"

**Cause:** CSS not including RTL classes

**Fix:** Ensure Tailwind config includes:
```javascript
// tailwind.config.js
module.exports = {
  // ...
  corePlugins: {
    // Don't disable direction, we use it
  },
  // Tailwind handles dir="rtl" automatically
};
```

---

## Quick Reference Checklist

### When Implementing New Feature

- [ ] Does the feature stage signals? Use this system.
- [ ] Create builder function in `staging-utilities.ts`
- [ ] Use `StagingButton` component
- [ ] Pass payload with correct `lang` and `is_rtl`
- [ ] Ensure AI Optimizer filters by language
- [ ] Test in both EN and AR

### When Updating Staging Logic

- [ ] Update ONLY `hooks/useStaging.ts`
- [ ] Do NOT duplicate logic in components
- [ ] Do NOT modify `StagingButton` internals
- [ ] All other files should just use the hook

### When Adding New Language

- [ ] Add to `LanguageCode` type in `staging-contract.ts`
- [ ] Update RTL list if needed
- [ ] All else automatic (hook handles it)

---

## Summary

This architecture achieves the goal stated in your requirements:

> "Ensure the `workspace_staging_vault` acts as a single-source-of-truth that is language-context-aware, allowing the AI Listing Optimizer to seamlessly pull the correct strategy based on the user's selected language."

✅ **Single-source-of-truth:** `useStaging` hook  
✅ **Language-context-aware:** Automatic `lang` detection and storage  
✅ **AI seamlessly pulls:** `filterByLanguage()` ensures data purity  
✅ **Correct strategy:** Language-specific recommendations guaranteed  

**Status:** Ready for implementation  
**Estimated Time:** 3-4 weeks for complete migration  
**ROI:** Easier to maintain, faster to extend, better consistency

---

**Next Step:** Start implementing Phase 1 (copy core files to codebase)

---
