# Button Replacement Summary — All 3 Pages Verified

**Status:** ✅ Complete audit + exact replacement instructions  
**Date:** June 4, 2026

---

## Executive Summary

You were right to double-check! I found the exact current button implementations and verified they're using the OLD navigation-based pattern. Here's what needs to change:

### The 3 Buttons to Replace

| Page | File | Current Button | Current Pattern | Status |
|------|------|---|---|---|
| **Reviews** | `components/reviews/IssueCard.tsx` (lines 131-263) | "Add to Optimization Backlog" → "Open in Listing Optimizer →" | 2-step state machine + `router.push()` | ❌ Navigation-based |
| **Market Intelligence** | `components/market/MarketIntelligenceClient.tsx` (lines 142-207) | "Optimize Listing with Market Spotlight" | `router.push()` with URL params | ❌ Navigation-based |
| **Competitor Spy** | `components/competitor-spy/competitor-spy-snapshot-card.tsx` (lines 206-216) | "Send to Optimizer" (via `onSendToOptimizer` callback) | `router.push()` via callback | ❌ Navigation-based |

---

## The Problem with Current Implementation

All 3 buttons use `router.push()` which:
1. ❌ Navigates away from current page
2. ❌ Loses user context (Reviews page → Optimizer)
3. ❌ Passes data via URL params (not persisted)
4. ❌ No database integration
5. ❌ No toast notifications
6. ❌ Signals disappear on refresh

---

## The Solution: Replace with StageButton

Replace each old button with the new `StageButton` component that:
1. ✅ Calls `POST /api/workspaces/{id}/staging/add`
2. ✅ Stores signal in database immediately
3. ✅ Shows success toast
4. ✅ User stays on current page
5. ✅ Full RTL/LTR support
6. ✅ Signals persist across sessions

---

## 3 Quick Replacements

### 1. Reviews Page (IssueCard.tsx)

**Before:** 10+ lines of state machine logic
```typescript
const [status, setStatus] = React.useState<PipelineStatus>(added ? "STAGED" : "AVAILABLE");
const [busy, setBusy] = React.useState(false);
async function handleClick() { ... }
```

**After:** 1 component
```typescript
<StageButton
  signalType="review_issue"
  content={issue.title}
  source="review_analysis"
  workspaceId={workspaceId}
  sourceAppId={appId || ""}
  metadata={{
    description: issue.description,
    severity: issue.severity,
    impact: issue.impact,
  }}
/>
```

---

### 2. Market Intelligence Page (MarketIntelligenceClient.tsx)

**Before:** Navigation with URL encoding
```typescript
const targets = spotlight.trendingKeywords
  .slice(0, 8)
  .map((kw) => `market_spotlight:${kw}`)
  .join(",");
router.push(`/app/${workspaceId}/listing-optimizer?exploit_targets=${targets}`);
```

**After:** Simple StageButton
```typescript
<StageButton
  signalType="keyword"
  content={spotlight.trendingKeywords.slice(0, 5).join(", ")}
  source="keyword_spotlight"
  workspaceId={workspaceId}
  sourceAppId={ownAppId || ""}
  metadata={{
    allTrendingKeywords: spotlight.trendingKeywords,
    asoTip: spotlight.asoTip,
  }}
/>
```

---

### 3. Competitor Spy Page (CompetitorSpySnapshotCard.tsx)

**Before:** Tooltip + Button with callback
```typescript
<TooltipProvider>
  <Tooltip content={t("sendOptimizerTooltip")}>
    <Button onClick={onSendToOptimizer}>
      <Sparkles className="size-4" />
      {t("sendOptimizer")}
    </Button>
  </Tooltip>
</TooltipProvider>
```

**After:** Single StageButton
```typescript
<StageButton
  signalType="competitor_weakness"
  content={`${competitorDisplayName}: ${liveTitle || displayName}`}
  source="competitor_spy"
  workspaceId={workspaceId}
  sourceAppId={appId || ""}
  metadata={{
    competitorName: competitorDisplayName,
    competitorPackageId: packageId,
    categoryLabel,
    bestRank,
  }}
/>
```

---

## Exact Steps (Copy-Paste Ready)

### For IssueCard.tsx
1. Add import: `import { StageButton } from "@/components/staging/StageButton";`
2. Delete lines 137-162 (state variables + handleClick function)
3. Delete lines 216-264 (entire TooltipProvider + Button)
4. Paste StageButton code above in CardContent
5. Remove unused imports: ArrowRight, CheckCircle2, PlusCircle, TooltipProvider, etc.

### For MarketIntelligenceClient.tsx
1. Add import: `import { StageButton } from "@/components/staging/StageButton";`
2. Replace entire `OptimizeWithSpotlightButton` function (lines 142-207)
3. Find where this component is called, add `ownAppId` prop
4. Remove unused imports: ArrowRight, Wand2, useRouter

### For CompetitorSpySnapshotCard.tsx
1. Add import: `import { StageButton } from "@/components/staging/StageButton";`
2. Add props: `workspaceId: string; appId?: string;`
3. Replace TooltipProvider section (lines 199-217)
4. Paste StageButton code
5. Remove unused imports: Sparkles, Tooltip, TooltipProvider
6. Find caller, pass `workspaceId` and `appId`

---

## Testing After Replacement

### Test 1: Reviews Page
```
1. Go to Reviews page
2. Click StageButton on any issue
3. ✓ Toast appears: "Successfully Staged"
4. ✓ User stays on Reviews page
5. ✓ Go to Optimizer
6. ✓ Issue appears in vault summary
```

### Test 2: Market Intelligence Page
```
1. Go to Market Intelligence page
2. Generate Spotlight
3. Click StageButton
4. ✓ Toast appears: "Successfully Staged"
5. ✓ User stays on Market Intelligence page
6. ✓ Go to Optimizer
7. ✓ Keywords appear in vault
```

### Test 3: Competitor Spy Page
```
1. Go to Competitor Spy page
2. Click StageButton
3. ✓ Toast appears: "Successfully Staged"
4. ✓ User stays on Competitor Spy page
5. ✓ Go to Optimizer
6. ✓ Weakness appears in vault
```

### Test 4: Arabic Support
```
1. Switch UI locale to Arabic
2. Stage issue/keyword/weakness
3. ✓ Button label in Arabic
4. ✓ Toast in Arabic
5. ✓ Content displays RTL
```

---

## What the New Flow Looks Like

```
BEFORE (❌ Navigation-based):
Reviews Page → Click Button → Navigate Away → Optimizer Page
                              Data in URL params (fragile)
                              No database persistence
                              User context lost

AFTER (✅ Vault-based):
Reviews Page → Click Button → POST /api/staging/add → Toast "Staged" → Stay on page
                             ↓
                    Signal stored in DB
                    User continues reviewing
                    
Later: Go to Optimizer Page → Auto-fetch vault → See staged signal
                              Signal ready to use for generation
                              All data persisted
```

---

## Files You Need to Edit

```
1. components/reviews/IssueCard.tsx
   - Replace handleClick logic
   - Replace button rendering
   - ~50 lines deleted, ~20 lines added

2. components/market/MarketIntelligenceClient.tsx
   - Replace OptimizeWithSpotlightButton function
   - Update caller with ownAppId prop
   - ~65 lines deleted, ~25 lines added

3. components/competitor-spy/competitor-spy-snapshot-card.tsx
   - Add workspaceId, appId props
   - Replace TooltipProvider section
   - Update component caller
   - ~19 lines deleted, ~25 lines added
```

---

## Files You Don't Need to Edit

✅ `components/reviews/ReviewsClient.tsx` — No changes (passes props to IssueCard)  
✅ Root layout — Toast already added in previous step  
✅ `lib/staging-vault/` — Already complete  
✅ API routes — Already complete  

---

## Common Gotchas to Avoid

### Gotcha 1: Forgetting to pass workspaceId to CompetitorSpySnapshotCard
```typescript
// ❌ WRONG: Missing workspaceId
<CompetitorSpySnapshotCard
  displayName={...}
  appId={...}
  // Missing workspaceId!
/>

// ✅ CORRECT:
<CompetitorSpySnapshotCard
  displayName={...}
  appId={...}
  workspaceId={workspaceId}  // Added
/>
```

### Gotcha 2: Not removing old callback (onSendToOptimizer)
```typescript
// ❌ WRONG: Still passing old callback
<CompetitorSpySnapshotCard
  {...props}
  onSendToOptimizer={handleOptimizer}  // No longer used!
/>

// ✅ CORRECT: Remove it entirely
<CompetitorSpySnapshotCard
  {...props}
  // onSendToOptimizer removed
/>
```

### Gotcha 3: Forgetting to add Toast to layout
```typescript
// ❌ WRONG: No ToastContainer
<body>
  {children}
</body>

// ✅ CORRECT:
import { ToastContainer } from "@/components/Toast";

<body>
  {children}
  <ToastContainer />  // Required for toasts to show
</body>
```

---

## Full Document Reference

See `EXACT_BUTTON_REPLACEMENTS.md` for:
- Line-by-line current code
- Exact issues with current code
- Complete replacement code
- Step-by-step instructions
- File-by-file checklist

---

## Timeline

**Quick Start:** ~30 minutes to replace all 3 buttons  
**Testing:** ~15 minutes to verify flow works  
**Total:** ~45 minutes to complete refactor

---

**Status:** ✅ Ready to implement

Start with IssueCard.tsx (simplest), then MarketIntelligenceClient.tsx, then CompetitorSpySnapshotCard.tsx.

All files ready, all instructions exact. No guessing needed!
