# Quick Reference Card — All Changes at a Glance

**Print this or keep it open while coding**

---

## The 3 Files You Need to Change

```
┌──────────────────────────────────────────────────────────────┐
│ FILE 1: components/reviews/IssueCard.tsx                    │
├──────────────────────────────────────────────────────────────┤
│ OPEN:    Ctrl+P → IssueCard.tsx → components/reviews/      │
│                                                              │
│ CHANGE 1: Line 1                                             │
│   ADD: import { StageButton } from "@/components/staging/..." │
│                                                              │
│ CHANGE 2: Lines 137-140                                      │
│   DELETE: const [status, setStatus] = ...                  │
│   DELETE: const [busy, setBusy] = ...                      │
│                                                              │
│ CHANGE 3: Lines 144-163                                      │
│   DELETE: async function handleClick() { ... }              │
│                                                              │
│ CHANGE 4: Lines 216-264                                      │
│   DELETE: <TooltipProvider>.....</TooltipProvider>          │
│   ADD:    <StageButton                                       │
│             signalType="review_issue"                        │
│             content={issue.title}                            │
│             source="review_analysis"                         │
│             workspaceId={workspaceId}                        │
│             sourceAppId={appId || ""}                        │
│             metadata={{...}}                                 │
│           />                                                 │
│                                                              │
│ CHANGE 5: Top imports cleanup                                │
│   DELETE: ArrowRight, CheckCircle2, PlusCircle              │
│   DELETE: TooltipProvider, TooltipRoot, TooltipTrigger      │
│   DELETE: CTA_CONFIG (entire const)                         │
│   DELETE: type PipelineStatus                               │
│                                                              │
│ RESULT: ~10 lines saved, cleaner code ✓                    │
└──────────────────────────────────────────────────────────────┘
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ FILE 2: components/market/MarketIntelligenceClient.tsx      │
├──────────────────────────────────────────────────────────────┤
│ OPEN:    Ctrl+P → MarketIntelligenceClient.tsx →           │
│          components/market/                                  │
│                                                              │
│ CHANGE 1: Line 1                                             │
│   ADD: import { StageButton } from "@/components/staging/..." │
│                                                              │
│ CHANGE 2: Lines 142-207                                      │
│   DELETE: function OptimizeWithSpotlightButton(...) { ... } │
│   ADD:    function OptimizeWithSpotlightButton({           │
│             spotlight,                                       │
│             workspaceId,                                     │
│             ownAppId,  // ← NEW PROP                         │
│             isRtl,                                           │
│           }) {                                               │
│             return <StageButton                              │
│               signalType="keyword"                           │
│               content={...trendingKeywords...}               │
│               source="keyword_spotlight"                     │
│               workspaceId={workspaceId}                      │
│               sourceAppId={ownAppId || ""}                   │
│               metadata={{...}}                               │
│             />                                               │
│           }                                                  │
│                                                              │
│ CHANGE 3: Where OptimizeWithSpotlightButton is called       │
│   FIND:  Ctrl+F → OptimizeWithSpotlightButton              │
│   ADD:   ownAppId={ownAppId}  // ← to the component call   │
│                                                              │
│ CHANGE 4: Top imports cleanup                                │
│   DELETE: ArrowRight, Wand2                                 │
│   DELETE: import { useRouter }                              │
│                                                              │
│ RESULT: Cleaner function, smaller file ✓                   │
└──────────────────────────────────────────────────────────────┘
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ FILE 3: components/competitor-spy/...snapshot-card.tsx      │
├──────────────────────────────────────────────────────────────┤
│ OPEN:    Ctrl+P → competitor-spy-snapshot-card.tsx →       │
│          components/competitor-spy/                          │
│                                                              │
│ CHANGE 1: Line 1                                             │
│   ADD: import { StageButton } from "@/components/staging/..." │
│                                                              │
│ CHANGE 2: Lines 43-57 (Props type)                           │
│   ADD AFTER line 49:                                         │
│     workspaceId: string;                                     │
│     appId?: string;                                          │
│   DELETE: onSendToOptimizer: () => void;                    │
│                                                              │
│ CHANGE 3: Line 59 (Function destructuring)                   │
│   ADD TO DESTRUCTURING:                                      │
│     workspaceId,                                             │
│     appId,                                                   │
│   DELETE FROM DESTRUCTURING:                                │
│     onSendToOptimizer,                                      │
│                                                              │
│ CHANGE 4: Lines 199-217 (Button)                             │
│   DELETE: <TooltipProvider>.....</TooltipProvider>          │
│   ADD:    <StageButton                                       │
│             signalType="competitor_weakness"                 │
│             content={`${competitorDisplayName}: ...`}        │
│             source="competitor_spy"                          │
│             workspaceId={workspaceId}                        │
│             sourceAppId={appId || ""}                        │
│             metadata={{...}}                                 │
│           />                                                 │
│                                                              │
│ CHANGE 5: Where CompetitorSpySnapshotCard is called         │
│   FIND:  Ctrl+F → CompetitorSpySnapshotCard                │
│   ADD:   workspaceId={workspaceId}                           │
│   ADD:   appId={appId}                                       │
│   DELETE: onSendToOptimizer={...}                           │
│                                                              │
│ CHANGE 6: Top imports cleanup                                │
│   DELETE: Sparkles                                           │
│   DELETE: TooltipProvider, Tooltip                           │
│                                                              │
│ RESULT: Props updated, button replaced ✓                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Search Strings (Copy & Paste These)

### For IssueCard.tsx
```
Search 1: const [status, setStatus]
Search 2: async function handleClick
Search 3: Pipeline CTA
Search 4: onSendToOptimizer
```

### For MarketIntelligenceClient.tsx
```
Search 1: function OptimizeWithSpotlightButton
Search 2: <OptimizeWithSpotlightButton
```

### For CompetitorSpySnapshotCard.tsx
```
Search 1: onSendToOptimizer: () => void
Search 2: sendOptimizer
Search 3: <CompetitorSpySnapshotCard
```

---

## The StageButton Code (Copy This)

### For Reviews (IssueCard.tsx)
```typescript
<StageButton
  signalType="review_issue"
  content={issue.title}
  source="review_analysis"
  workspaceId={workspaceId}
  sourceAppId={appId || ""}
  language="en"
  metadata={{
    description: issue.description,
    severity: issue.severity,
    impactPercent: impactPct,
    quote: issue.quote,
  }}
  variant="primary"
  size="md"
  className="mt-1 w-full"
/>
```

### For Market Intelligence (MarketIntelligenceClient.tsx)
```typescript
<StageButton
  signalType="keyword"
  content={spotlight.trendingKeywords.slice(0, 5).join(", ")}
  source="keyword_spotlight"
  workspaceId={workspaceId}
  sourceAppId={ownAppId || ""}
  language={isRtl ? "ar" : "en"}
  metadata={{
    allTrendingKeywords: spotlight.trendingKeywords,
    asoTip: spotlight.asoTip,
    keywordCount: spotlight.trendingKeywords.length,
  }}
  variant="primary"
  size="lg"
  label={
    isRtl
      ? "إضافة إلى الخزنة"
      : "Stage Keywords to Vault"
  }
/>
```

### For Competitor Spy (CompetitorSpySnapshotCard.tsx)
```typescript
<StageButton
  signalType="competitor_weakness"
  content={`${competitorDisplayName}: ${liveTitle || displayName}`}
  source="competitor_spy"
  workspaceId={workspaceId}
  sourceAppId={appId || ""}
  language={isRtl ? "ar" : "en"}
  metadata={{
    competitorName: competitorDisplayName,
    competitorPackageId: packageId,
    categoryLabel,
    bestRank,
    metricsKeywordCount,
  }}
  variant="primary"
  size="md"
  className="w-full sm:flex-1"
  label={t("sendOptimizer")}
/>
```

---

## Quick Test Checklist

```
AFTER SAVING ALL 3 FILES:

☐ npm run dev (or yarn dev)
☐ Go to http://localhost:3000/reviews
☐ Look for StageButton (should replace old button)
☐ Click StageButton
☐ Toast appears ✓
☐ Page doesn't navigate ✓
☐ Go to http://localhost:3000/market-intelligence
☐ Click StageButton
☐ Toast appears ✓
☐ Page doesn't navigate ✓
☐ Go to http://localhost:3000/competitor-spy
☐ Click StageButton
☐ Toast appears ✓
☐ Page doesn't navigate ✓
☐ Go to http://localhost:3000/optimizer
☐ See vault with all 3 staged signals ✓
```

---

## Success Indicators

### Before ❌
```
Click button → Page navigates away
              → No toast
              → Data in URL
              → Lost on refresh
```

### After ✅
```
Click button → Page stays the same
              → Toast: "Successfully Staged"
              → Data in database
              → Go to Optimizer → signals appear
```

---

## If You Get Stuck

| Problem | Solution |
|---------|----------|
| Can't find the file | Use Ctrl+P to open file finder |
| Can't find the line | Use Ctrl+G to go to specific line |
| Old code still there | Make sure you selected entire section before delete |
| Toast not showing | Check root layout has `<ToastContainer />` |
| Import error | Verify path: `@/components/staging/StageButton` |
| Component not found | Make sure StageButton.tsx file exists |

---

## Time Estimate

```
File 1 (IssueCard.tsx):            ~10 minutes
File 2 (MarketIntelligenceClient): ~10 minutes  
File 3 (CompetitorSpySnapshotCard): ~15 minutes
Testing:                            ~10 minutes
─────────────────────────────────────
TOTAL:                              ~45 minutes
```

---

## Files Already Done ✅

These files are already complete, no changes needed:

```
✓ components/staging/StageButton.tsx
✓ components/Toast.tsx
✓ hooks/useToast.ts
✓ hooks/useVault.ts
✓ API endpoints (/api/workspaces/[id]/staging/add, etc)
✓ Database migration
```

---

## Print This Out

You can print this page and keep it next to your monitor while coding. Or keep it open in a second monitor/tab.

The 3 StageButton code blocks above are exactly what goes in each file.

---

**Status:** ✅ All information in one place

Start with IssueCard.tsx. It's the simplest.

Good luck! 🚀
