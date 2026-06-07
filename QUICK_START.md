# Quick Start: Unified Language-Aware Staging System

**TL;DR:** New unified system for all staging operations. One hook, one button, one contract. Language and RTL handled automatically.

---

## 📦 What You're Getting

| File | Purpose | Lines |
|------|---------|-------|
| `types/staging-contract.ts` | Interface contract + helpers | 270 |
| `hooks/useStaging.ts` | React hook for staging logic | 190 |
| `lib/staging-utilities.ts` | Builders, validators, filters | 380 |
| `components/staging/StagingButton.tsx` | Universal button component | 220 |
| **TOTAL** | **Complete system** | **1,060** |

---

## 🚀 30-Second Implementation

### Step 1: Copy Files
```bash
cp types-staging-contract.ts → src/types/
cp useStaging-hook.ts → src/hooks/useStaging.ts
cp staging-utilities.ts → src/lib/
cp StagingButton.tsx → src/components/staging/
```

### Step 2: Use in Component
```typescript
import { StagingButton } from '@/components/staging/StagingButton';
import { buildCompetitorSpyPayload } from '@/lib/staging-utilities';
import { useLocale } from 'next-intl';

export function MyComponent() {
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

### Step 3: Filter in AI Optimizer
```typescript
import { filterByLanguage } from '@/lib/staging-utilities';

const signals = await fetchSignals();
const userSignals = filterByLanguage(signals, language);
```

**Done!** ✅ Language-aware, RTL-ready, type-safe.

---

## 🎯 What Each File Does

### `types/staging-contract.ts`
```typescript
// The interface contract ALL modules must follow
interface UnifiedStagingPayload {
  source: string;           // 'competitor_spy', 'review_analysis', etc.
  category: string;         // 'competitor_weakness', 'review_issue', etc.
  intent: string;           // Signal type
  content_array: (string|object)[]; // Main data (keywords, issues, etc.)
  lang: 'en' | 'ar';       // REQUIRED: User's language
  is_rtl: boolean;          // Computed: true for Arabic
  metadata?: Record<string, any>; // Extra context
}

// Use builder to create payload:
const payload = buildStagingPayload(
  source, category, intent, content_array, lang
);
```

---

### `hooks/useStaging.ts`
```typescript
// ONE hook to rule them all
const { 
  stage,       // Async: stage(payload) → Promise<void>
  loading,     // Boolean: is API call in progress?
  staged,      // Boolean: was it successful?
  error,       // String: error message if failed
  reset,       // Function: reset states
  language,    // String: 'en' or 'ar'
  isRtl        // Boolean: true for Arabic
} = useStaging();

// That's it! Toast notifications, validation, API calls all automatic.
```

---

### `lib/staging-utilities.ts`
```typescript
// BUILDERS: Construct payloads
buildCompetitorSpyPayload(name, keywords, metadata, lang)
buildReviewAnalysisPayload(issues, metadata, lang)
buildKeywordTrackerPayload(keywords, metadata, lang)

// VALIDATORS: Check payloads
validateStagingPayload(payload)
validateContentArray(array)
validateLanguage(lang)

// FILTERS: Query staging vault
filterByLanguage(records, 'en' | 'ar')
filterBySignalType(records, 'competitor_weakness')
filterBySource(records, 'competitor_spy')
filterByMultiple(records, { lang, signalType, source })

// All pure functions = testable, reusable, composable
```

---

### `components/staging/StagingButton.tsx`
```typescript
// ONE button component for everything
<StagingButton
  payload={payload}          // UnifiedStagingPayload
  variant="primary"          // 'primary' | 'secondary' | 'ghost' | 'outline'
  size="md"                  // 'sm' | 'md' | 'lg'
  label="Add to Queue"       // Custom label (auto EN/AR)
  onStaged={() => {}}        // Callback after success
/>

// Features:
// ✅ Auto language detection (en/ar)
// ✅ Auto RTL rendering
// ✅ State machine: idle → loading → staged
// ✅ Bilingual toasts
// ✅ Zero config needed
```

---

## 🌍 Language & RTL (Automatic!)

```typescript
// IN YOUR COMPONENT:
const language = useLocale() as 'en' | 'ar';
const payload = buildCompetitorSpyPayload(..., language);

// IN THE HOOK:
const { isRtl } = useStaging();
// isRtl = true automatically if language === 'ar'

// IN THE BUTTON:
<StagingButton payload={payload} />
// Renders dir="rtl" if language === 'ar' 
// Shows Arabic labels if language === 'ar'
// Sends Arabic toast if language === 'ar'

// YOU DON'T NEED TO WRITE ANY RTL CODE!
```

---

## 📊 Real Examples

### Example 1: Competitor Spy
```typescript
const payload = buildCompetitorSpyPayload(
  'FitTrack Pro',
  ['fitness tracker', 'calorie counter', 'weight loss'],
  {
    competitorPackageId: 'com.fittrack.pro',
    categoryLabel: 'Health & Fitness',
    bestRank: 42,
  },
  language // auto-detected from useLocale()
);

return <StagingButton payload={payload} />;
```

### Example 2: Review Insights
```typescript
const payload = buildReviewAnalysisPayload(
  ['Grammar error', 'Missing feature', 'Crash on Android'],
  { appName: 'HealthHub', severity: 'high' },
  language
);

return <StagingButton payload={payload} variant="secondary" />;
```

### Example 3: AI Optimizer (Retrieve with Language Filter)
```typescript
const signals = await fetchSignals(workspaceId);
const userSignals = filterByLanguage(signals, language);

// Now render only signals in user's language
// English user sees English signals only
// Arabic user sees Arabic signals only
// AI recommendations are language-correct!
```

---

## ✅ Checklist: Are You Ready?

- [ ] Read `ARCHITECTURE_SUMMARY.md` (understand the design)
- [ ] Read `REFACTORING_GUIDE.md` (see step-by-step)
- [ ] Review `EXAMPLE_REFACTORED_MODULE.tsx` (before/after)
- [ ] Copy 4 core files to your codebase
- [ ] Update 1 module as a test
- [ ] Verify it works (button stages, data in DB, language correct)
- [ ] Refactor remaining modules
- [ ] Update AI Optimizer retrieval
- [ ] Test in both EN and AR
- [ ] Deploy!

---

## 🆘 Most Common Questions

**Q: Do I have to refactor all modules at once?**  
A: No! Do one at a time. Old and new can coexist.

**Q: What if my payload structure is different?**  
A: Create a new builder function. Still use `StagingButton`.

**Q: How do I handle async payload construction?**  
A: Use `<StagingButtonAsync getPayload={async () => {...}} />`

**Q: What if the AI Optimizer is in a different part of the code?**  
A: Import `filterByLanguage()` there too. Filters work anywhere.

**Q: Do I need to change database schema?**  
A: No! Just make sure `language` field exists (you already have it).

**Q: What if I'm not using `next-intl`?**  
A: Replace `useLocale()` with your language detection method.

**Q: Can I add more languages later?**  
A: Yes! Add to `LanguageCode` type and update RTL list if needed.

---

## 🚀 Deploy Command

```bash
git add src/types/staging-contract.ts \
         src/hooks/useStaging.ts \
         src/lib/staging-utilities.ts \
         src/components/staging/StagingButton.tsx

git commit -m "feat: unified language-aware staging system

- Standardize all staging operations with UnifiedStagingPayload contract
- Centralize logic in useStaging hook (replaces feature-specific logic)
- Add utilities for builders, validators, and filtering
- Create universal StagingButton (replaces multiple button components)
- Support EN/AR with automatic RTL rendering
- Filter staging vault by language for data purity
- Refactor feature modules incrementally"

git push origin main
```

---

## 📚 Full Documentation

- **`ARCHITECTURE_SUMMARY.md`** — Full design overview (15 min read)
- **`REFACTORING_GUIDE.md`** — Step-by-step implementation (30 min read)
- **`EXAMPLE_REFACTORED_MODULE.tsx`** — Real before/after example (5 min read)
- **Inline comments** — Every function explained in code

---

## 💡 Pro Tips

1. **Start with Competitor Spy** — It's the simplest to refactor
2. **Test language filter first** — Most important for AI Optimizer
3. **Keep old components temporarily** — No need to delete everything at once
4. **Add unit tests** — Builders and validators are easy to test
5. **Monitor database** — Verify `language` field populated correctly

---

## 🎓 Learning Path

1. **Day 1:** Read ARCHITECTURE_SUMMARY.md + REFACTORING_GUIDE.md
2. **Day 2:** Copy files, review EXAMPLE_REFACTORED_MODULE.tsx
3. **Day 3:** Refactor 1 module (Competitor Spy) as test
4. **Day 4:** Refactor 2-3 more modules (Review Insights, Market Intelligence)
5. **Day 5:** Update AI Optimizer, test EN/AR, deploy

**Estimated Time:** 5 days (working part-time)

---

**Status:** ✅ Ready to implement  
**Complexity:** 🟢 Medium (but well-documented)  
**ROI:** 🟢 High (easier to maintain, faster to extend)

**Questions?** Check the relevant doc or inline code comments.

---
