# ASO Workbench Refactoring Guide: Unified Language-Aware Staging

**Version:** 5.0 - Professional Grade  
**Date:** June 7, 2026  
**Status:** 🚀 Ready for Implementation  
**Scope:** Competitor Spy, Keyword Gaps, Review Insights, Asset Audits

---

## 🎯 Executive Summary

This refactoring standardizes how ALL features interact with `workspace_staging_vault` by:

1. **Creating a unified `UnifiedStagingPayload` contract** — standardized interface for all modules
2. **Building a centralized `useStaging` hook** — single source of truth for staging logic
3. **Implementing language-aware utilities** — automatic EN/AR detection and RTL rendering
4. **Consolidating staging buttons** — replaces 5+ specialized components with one
5. **Enabling language-specific retrieval** — AI Optimizer filters by `lang` for data purity

**Result:** Adding a new feature (e.g., "Market Trends") is plug-and-play. No need to duplicate staging logic.

---

## 📋 Architecture Overview

### Before (Current State)
```
Competitor Spy ─┬─→ KeywordTrackerStagingButton (170 lines)
                ├─→ Custom payload construction
                ├─→ Custom RTL logic
                └─→ Custom error handling

Review Insights ┼─→ AlertsStagingButton (200 lines)
                ├─→ Custom payload construction
                ├─→ Custom RTL logic
                └─→ Custom error handling

Market Intelligence ─┼─→ Similar duplication
                     └─→ Similar duplication

[PROBLEM: 5+ files, inconsistent patterns, hard to maintain]
```

### After (This Refactoring)
```
┌─────────────────────────────────────────────────────────┐
│            useStaging Hook (Centralized)                 │
│  ┌─ Language detection (useLocale)                      │
│  ├─ RTL computation                                      │
│  ├─ Payload validation                                   │
│  ├─ API calls                                            │
│  ├─ State management (idle/loading/staged)              │
│  └─ Toast notifications (EN/AR)                          │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│      Staging Utilities (Pure Functions)                   │
│  ├─ Payload builders (buildCompetitorSpyPayload, ...)   │
│  ├─ Validators                                           │
│  ├─ Transformers                                         │
│  └─ Filtering (by lang, by source, etc.)                │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│      Unified StagingButton Component                      │
│  ├─ Works with UnifiedStagingPayload                    │
│  ├─ Full EN/AR + RTL support                            │
│  ├─ State machine: idle → loading → staged              │
│  └─ Bilingual UI + toasts                               │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│          All Feature Modules Use Above                    │
│  ├─ Competitor Spy                                      │
│  ├─ Review Insights                                      │
│  ├─ Keyword Gaps                                         │
│  ├─ Asset Audits                                         │
│  └─ Future: Market Trends, Crash Insights, etc.        │
└─────────────────────────────────────────────────────────┘

[BENEFIT: Single source of truth, easy to extend]
```

---

## 📦 Core Files (What We're Shipping)

### 1. `types/staging-contract.ts`
**Purpose:** Define the unified interface  
**Key Exports:**
- `UnifiedStagingPayload` — The contract all modules must conform to
- `LanguageCode`, `isRtlLanguage()` — Language utilities
- `StagingButtonProps` — Props for StagingButton component
- `validateStagingPayload()`, `buildStagingPayload()` — Builders
- `transformToVaultRecord()` — Transform to DB schema

**When to Edit:** Never (unless adding new language)

---

### 2. `hooks/useStaging.ts`
**Purpose:** Centralized staging logic  
**Key Exports:**
- `useStaging()` — Main hook
- `useStagingWithWorkspace()` — Variant with predefined workspace
- `useStagingBatch()` — Batch staging multiple signals

**When to Edit:** Only if API endpoint changes or toast library changes

**Never Edit:** State machine, language detection, validation logic

---

### 3. `lib/staging-utilities.ts`
**Purpose:** Reusable pure functions  
**Key Exports:**
- `buildCompetitorSpyPayload()`, `buildReviewAnalysisPayload()`, etc.
- `filterByLanguage()`, `filterBySignalType()` — Retrieval filters
- `enrichMetadata()`, `getMetadataField()` — Metadata helpers
- `validateContentArray()`, `sanitizeContent()` — Content helpers
- `logPayloadVerification()` — Debugging utilities

**When to Edit:** Add new builder functions for new feature modules

---

### 4. `components/staging/StagingButton.tsx`
**Purpose:** Universal staging button component  
**Key Exports:**
- `StagingButton` — Main component
- `StagingButtonCompact` — Icon-only variant
- `StagingButtonText` — Text-only variant
- `StagingButtonAsync` — For async payload construction

**When to Edit:** Only for UI/styling changes. Never touch logic.

---

## 🔧 Implementation Steps

### Step 1: Install Core Files

Copy these files to your codebase:
```
src/
├── types/
│   └── staging-contract.ts          (new)
├── hooks/
│   └── useStaging.ts                (new)
├── lib/
│   └── staging-utilities.ts         (new)
└── components/staging/
    └── StagingButton.tsx            (new)
```

**Dependencies Required:**
- `next-intl` (useLocale, useTranslations) — already installed
- `@/hooks/useToast` — already exists
- `@/lib/utils` (cn function) — already exists
- `lucide-react` (icons) — already installed

---

### Step 2: Refactor Competitor Spy Module

**File:** `components/competitor-spy/competitor-spy-snapshot-card.tsx`

**Before:**
```typescript
import { StageButtonRefactored } from '@/components/staging/StageButtonRefactored';
import { KeywordSurfacesInline } from '@/components/competitor-spy/keyword-surfaces-inline';

export function CompetitorSpySnapshotCard() {
  // ... existing code ...
  
  return (
    <div>
      {/* ... card content ... */}
      <StageButtonRefactored
        signalType="competitor_weakness"
        content={JSON.stringify({
          competitor_name: competitorName,
          app_title: appTitle,
          keywords: keywordSurfaces,
        })}
        source="competitor_spy"
        sourceContext="competitor_weakness"
        sourceContextId={competitorPackageId}
        metadata={{
          competitorName,
          keywords: keywordSurfaces,
          // ... other fields ...
        }}
        language={language}
      />
    </div>
  );
}
```

**After:**
```typescript
import { StagingButton } from '@/components/staging/StagingButton';
import { buildCompetitorSpyPayload } from '@/lib/staging-utilities';
import { useLocale } from 'next-intl';

export function CompetitorSpySnapshotCard() {
  const language = useLocale() as 'en' | 'ar';
  
  // ... existing code ...
  
  const payload = buildCompetitorSpyPayload(
    competitorName,
    keywordSurfaces,
    {
      competitorPackageId,
      categoryLabel: category,
      bestRank: ranking,
      metricsKeywordCount: keywordSurfaces.length,
    },
    language
  );

  return (
    <div>
      {/* ... card content ... */}
      <StagingButton
        payload={payload}
        variant="primary"
        label={language === 'ar' ? 'إضافة إلى المحلل' : 'Send to Optimizer'}
      />
    </div>
  );
}
```

**What Changed:**
- ✅ Replaced `StageButtonRefactored` with `StagingButton`
- ✅ Used `buildCompetitorSpyPayload()` builder instead of manual object
- ✅ Language automatically detected via `useLocale()`
- ✅ Cleaner, more declarative code
- ✅ No RTL logic needed (handled by hook + button)

---

### Step 3: Refactor Review Insights Module

**File:** `components/reviews/IssueCard.tsx`

**Before:**
```typescript
import { StageButtonRefactored } from '@/components/staging/StageButtonRefactored';

export function IssueCard() {
  // ... existing code ...
  
  return (
    <StageButtonRefactored
      signalType="review_issue"
      content={issueDescription}
      source="review_analysis"
      sourceContext="review_issue"
      // ... other props ...
    />
  );
}
```

**After:**
```typescript
import { StagingButton } from '@/components/staging/StagingButton';
import { buildReviewAnalysisPayload } from '@/lib/staging-utilities';
import { useLocale } from 'next-intl';

export function IssueCard() {
  const language = useLocale() as 'en' | 'ar';
  
  const payload = buildReviewAnalysisPayload(
    [issueDescription],
    {
      severity: issueSeverity,
      appName: myAppName,
      issueType: category,
    },
    language
  );

  return (
    <StagingButton
      payload={payload}
      variant="secondary"
    />
  );
}
```

---

### Step 4: Refactor Market Intelligence Module

**File:** `components/market/MarketIntelligenceClient.tsx`

**Similar pattern to above** — replace manual payload construction with builder functions.

---

### Step 5: Update AI Listing Optimizer Retrieval Logic

**File:** `components/ai-listing-optimizer/AIListingOptimizer.tsx` (or equivalent)

**Add Language-Based Filtering:**

```typescript
import { filterByLanguage, filterByMultiple } from '@/lib/staging-utilities';
import { useLocale } from 'next-intl';

export function AIListingOptimizer() {
  const language = useLocale() as 'en' | 'ar';

  // Fetch signals from staging vault
  const signals = await fetchStagingSignals(workspaceId);

  // IMPORTANT: Filter by user's language to ensure data purity
  const relevantSignals = filterByLanguage(signals, language);
  // OR multi-filter:
  // const relevantSignals = filterByMultiple(signals, {
  //   lang: language,
  //   signalType: 'competitor_weakness',
  //   source: 'competitor_spy'
  // });

  // Now process signals with confidence they're in the right language
  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Render keyword strategies, insights, etc. */}
    </div>
  );
}
```

**Why This Matters:**
- English keywords should NOT appear in Arabic strategy
- Arabic keywords should NOT appear in English strategy
- Language-specific synonyms and intent vary by language
- Data purity = better AI recommendations

---

## 📊 Payload Examples

### Example 1: Competitor Spy Payload

```typescript
const payload = buildCompetitorSpyPayload(
  'FitTrack Pro',
  [
    'fitness tracker',
    'calorie counter',
    'workout planner',
    'weight loss',
    'step counter',
    'meal tracker',
  ],
  {
    competitorPackageId: 'com.fittrack.pro',
    categoryLabel: 'Health & Fitness',
    bestRank: 42,
    metricsKeywordCount: 6,
  },
  'en' // or 'ar' for Arabic
);

// Result:
{
  source: 'competitor_spy',
  category: 'competitor_weakness',
  intent: 'competitor_weakness',
  content_array: ['fitness tracker', 'calorie counter', ...],
  lang: 'en',
  is_rtl: false,
  metadata: {
    competitorName: 'FitTrack Pro',
    keywordCount: 6,
    competitorPackageId: 'com.fittrack.pro',
    categoryLabel: 'Health & Fitness',
    bestRank: 42,
    metricsKeywordCount: 6,
  },
  title: 'Competitor Weakness: FitTrack Pro',
  description: 'Found 6 competitive keywords from FitTrack Pro'
}
```

### Example 2: Review Insights Payload

```typescript
const payload = buildReviewAnalysisPayload(
  [
    'Grammar errors in description',
    'Missing feature: offline mode',
    'Crash on Android 12',
  ],
  {
    appName: 'HealthHub',
    severity: 'high',
  },
  'ar' // Arabic
);

// Result:
{
  source: 'review_analysis',
  category: 'review_issue',
  intent: 'review_issue',
  content_array: ['Grammar errors...', 'Missing feature...', 'Crash on...'],
  lang: 'ar',
  is_rtl: true,
  metadata: {
    issueCount: 3,
    appName: 'HealthHub',
    severity: 'high',
  },
  title: 'Review Insights: HealthHub',
  description: 'Found 3 common review issues'
}
```

---

## 🌍 Language & RTL Handling

### Automatic Language Detection

```typescript
const { language, isRtl } = useStaging();

// language is automatically 'en' or 'ar' from useLocale()
// isRtl is automatically computed: true if lang === 'ar'
```

### In Components

```typescript
// All UI automatically RTL-aware:
<button dir={isRtl ? 'rtl' : 'ltr'} className={isRtl && 'flex-row-reverse'}>
  {/* Component handles RTL automatically */}
</button>

// Toast notifications automatically bilingual:
showToast({
  title: language === 'ar' ? 'تمت الإضافة' : 'Added to queue',
  // ...
});
```

### In Database

Every record in `workspace_staging_vault` includes:
```json
{
  "language": "en" or "ar",
  // ...
}
```

### In AI Optimizer

Always filter by language when retrieving:
```typescript
const relevantSignals = filterByLanguage(allSignals, userLanguage);
```

---

## 🧪 Testing Checklist

### Unit Tests (For Each Module After Refactoring)

- [ ] Payload builds correctly with `buildCompetitorSpyPayload()`
- [ ] Language defaults to `useLocale()` value
- [ ] `is_rtl` computed correctly (true for 'ar', false for 'en')
- [ ] `StagingButton` renders with correct label (EN/AR)
- [ ] Button state transitions: idle → loading → staged
- [ ] Toast notifications show in correct language
- [ ] RTL layout applied when `language === 'ar'`

### Integration Tests

- [ ] Competitor Spy: Click button → signal appears in vault with keywords
- [ ] Review Insights: Click button → signal appears in vault with issues
- [ ] Market Intelligence: Click button → signal appears in vault with trends
- [ ] AI Optimizer: Filters signals by language (EN and AR separately)
- [ ] No cross-language contamination (EN keywords don't appear in AR view)

### E2E Tests

- [ ] User switches to Arabic → all buttons show Arabic text
- [ ] User stages signal in Arabic → vault record has `language: 'ar'`
- [ ] User opens AI Optimizer in Arabic → sees only Arabic signals
- [ ] User switches back to English → sees only English signals
- [ ] No page reload required (all async, local state)

---

## 🚀 Deployment Checklist

### Before Deployment

- [ ] All core files copied to codebase
- [ ] All modules refactored (Competitor Spy, Review Insights, Market Intelligence)
- [ ] AI Optimizer retrieval logic updated with language filtering
- [ ] TypeScript build passes (`npm run build`)
- [ ] No console errors or warnings
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass

### Deployment Commands

```bash
# 1. Verify build
npm run build
# Expected: No errors

# 2. Test locally
npm run dev
# Expected: All features work, toasts bilingual, RTL correct

# 3. Commit and push
git add src/types/staging-contract.ts \
         src/hooks/useStaging.ts \
         src/lib/staging-utilities.ts \
         src/components/staging/StagingButton.tsx
git commit -m "refactor: implement unified language-aware staging system

- Create UnifiedStagingPayload contract for all modules
- Implement useStaging hook for centralized logic
- Build staging utilities (builders, validators, filters)
- Create unified StagingButton component
- Refactor Competitor Spy, Review Insights, Market Intelligence
- Add language-based filtering to AI Optimizer
- Full EN/AR + RTL support
- Complete documentation"
git push origin main
```

### Post-Deployment Monitoring

- [ ] Check console logs for `[useStaging]` messages
- [ ] Monitor database for signals with `language` field populated
- [ ] Verify AI Optimizer shows language-correct signals
- [ ] Test EN and AR separately, verify no mixing
- [ ] Check error rates (should be unchanged)
- [ ] Monitor user feedback

---

## 🔄 Migration Path (If Keeping Old Components)

If you need backwards compatibility, you can keep old components temporarily:

```typescript
// Old component (deprecated)
export function StageButtonRefactored() {
  // Can now just wrap new StagingButton
  const payload = transformOldPayloadToNew(props);
  return <StagingButton payload={payload} />;
}
```

But recommend removing within 1-2 sprints.

---

## 📈 Future Features (Easy to Add)

Once this system is in place, adding new features is trivial:

### Adding "Market Trends" Module

```typescript
// 1. Create builder function in staging-utilities.ts
export function buildMarketTrendsPayload(
  trends: string[],
  metadata: Record<string, any>,
  lang: LanguageCode = 'en'
): UnifiedStagingPayload {
  return {
    source: 'market_trends',
    category: 'market_trend',
    intent: 'market_trend',
    content_array: trends,
    lang,
    is_rtl: isRtlLanguage(lang),
    metadata: {
      trendCount: trends.length,
      ...metadata,
    },
  };
}

// 2. Use in component
import { StagingButton } from '@/components/staging/StagingButton';
import { buildMarketTrendsPayload } from '@/lib/staging-utilities';

export function MarketTrendsCard() {
  const language = useLocale() as 'en' | 'ar';
  const payload = buildMarketTrendsPayload(trends, { region, season }, language);
  return <StagingButton payload={payload} />;
}

// 3. Filter in AI Optimizer
const trendSignals = filterBySource(signals, 'market_trends');
const langFilteredTrends = filterByLanguage(trendSignals, language);
```

**That's it!** No need to create new buttons, no RTL logic, no duplication.

---

## 📚 Quick Reference

### When to Use Which Function

| Task | Use This | Location |
|------|----------|----------|
| Validate payload | `validateStagingPayload()` | `staging-contract.ts` |
| Build Competitor Spy payload | `buildCompetitorSpyPayload()` | `staging-utilities.ts` |
| Build Review payload | `buildReviewAnalysisPayload()` | `staging-utilities.ts` |
| Fetch and stage | `useStaging()` hook | `useStaging.ts` |
| Filter by language | `filterByLanguage()` | `staging-utilities.ts` |
| Multi-filter | `filterByMultiple()` | `staging-utilities.ts` |
| Render button | `<StagingButton />` | `StagingButton.tsx` |
| Check RTL | `isRtlLanguage()` | `staging-contract.ts` |

### Common Patterns

**Pattern 1: Build and Stage (Most Common)**
```typescript
const payload = buildCompetitorSpyPayload(..., language);
return <StagingButton payload={payload} />;
```

**Pattern 2: Async Payload**
```typescript
<StagingButtonAsync
  getPayload={async () => {
    const data = await fetchData();
    return buildPayload(data, language);
  }}
/>
```

**Pattern 3: Batch Staging**
```typescript
const { stageBatch } = useStagingBatch();
const results = await stageBatch([payload1, payload2, payload3]);
```

**Pattern 4: Filter Before Display**
```typescript
const signals = await fetch(...);
const userLanguageSignals = filterByLanguage(signals, language);
```

---

## 🐛 Troubleshooting

### Issue: Button shows "Adding..." but never completes

**Check:**
1. API endpoint `/api/workspaces/staging/add` exists
2. Workspace ID is valid UUID
3. Console logs show error details
4. Network tab shows POST request

**Fix:** Ensure API endpoint exists and is working.

---

### Issue: Toast notifications don't show

**Check:**
1. `useToast()` hook imported and working
2. `showToast()` being called in useStaging
3. No toast library conflicts

**Fix:** Verify `@/hooks/useToast` exists and works.

---

### Issue: Arabic signals appearing in English view

**Check:**
1. AI Optimizer NOT filtering by language
2. Missing `filterByLanguage()` call

**Fix:** Add language filter when retrieving signals:
```typescript
const signals = filterByLanguage(allSignals, userLanguage);
```

---

### Issue: RTL layout not applying

**Check:**
1. `dir="rtl"` attribute on button/container
2. Tailwind RTL class (`flex-row-reverse`) applied
3. CSS `direction: rtl` in Tailwind config

**Fix:** StagingButton handles this automatically. If custom UI, add:
```typescript
dir={isRtl ? 'rtl' : 'ltr'}
className={isRtl && 'flex-row-reverse'}
```

---

## 📞 Support

### Where to Look for Issues

1. **Language not detected:** Check `useLocale()` in component
2. **Payload validation failing:** Check console for `validateStagingPayload()` errors
3. **API call failing:** Check network tab for POST to `/api/workspaces/staging/add`
4. **RTL not working:** Check `dir` attribute and Tailwind RTL classes
5. **Toast not showing:** Check `@/hooks/useToast` implementation

---

## ✅ Success Criteria

After complete refactoring, you should have:

- [x] All modules use `UnifiedStagingPayload` contract
- [x] All modules use `useStaging()` hook
- [x] All modules use `StagingButton` component
- [x] All modules have language-aware payloads with `lang` field
- [x] All modules send `is_rtl` in metadata
- [x] AI Optimizer filters signals by language
- [x] No code duplication across modules
- [x] Full EN/AR support with automatic RTL
- [x] Adding new features is plug-and-play
- [x] Single source of truth for staging logic

---

## 📝 Version History

| Date | Version | Changes |
|------|---------|---------|
| Jun 5, 2026 | 4.0 | Keywords in staging payload |
| Jun 7, 2026 | 5.0 | Unified language-aware system |

---

**Last Updated:** June 7, 2026  
**Status:** Ready for Implementation  
**Maintainer:** You

---
