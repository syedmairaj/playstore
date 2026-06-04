# Exact Button Replacements — Current Code Audit

**Status:** Verified current implementations and exact replacements  
**Date:** June 4, 2026

---

## Summary of Current Buttons Found

| Page | Component File | Current Button | Navigation | What It Does |
|------|---|---|---|---|
| **Reviews** | `IssueCard.tsx` | "Add to Optimization Backlog" (AVAILABLE) / "Open in Listing Optimizer →" (STAGED) | `router.push('/app/{workspaceId}/listing-optimizer')` | Uses internal navigation + state machine |
| **Market Intelligence** | `MarketIntelligenceClient.tsx` | "Optimize Listing with Market Spotlight" | `router.push('/app/{workspaceId}/listing-optimizer?exploit_targets=...')` | Passes keywords as URL params |
| **Competitor Spy** | *Not found yet* | "Stage Competitor Exploit" (assumed) | Unknown | TBD |

---

## Current Implementation Analysis

### 1. Reviews Page — IssueCard.tsx (Lines 131-163)

**Current Code:**
```typescript
// ❌ BEFORE: Navigation-based
async function handleClick() {
  if (busy) return;

  if (status === "STAGED") {
    // Navigate to listing optimizer
    const qs = appId ? `?appId=${encodeURIComponent(appId)}` : "";
    router.push(`/app/${workspaceId}/listing-optimizer${qs}`);
    return;
  }

  // POST to backlog (old system)
  setBusy(true);
  try {
    const ok = await onAdd();
    if (ok) setStatus("STAGED");
  } finally {
    setBusy(false);
  }
}
```

**Problems:**
- Two-step state machine (AVAILABLE → POST → STAGED → navigate)
- Uses `onAdd()` callback that POSTs to `/api/workspaces/[id]/backlog` (old system)
- STAGED state then navigates away (loses context)
- No integration with Staging Vault

**✅ REPLACEMENT:**

Replace the entire `handleClick` function and button rendering with `StageButton`:

```typescript
// ✅ AFTER: Staging Vault based
import { StageButton } from "@/components/staging/StageButton";

// Remove: const [status, setStatus] = React.useState<PipelineStatus>(...)
// Remove: const [busy, setBusy] = React.useState(false)
// Remove: const cta = CTA_CONFIG[status]
// Remove: async function handleClick() { ... }

// In the CardContent, replace the entire TooltipProvider section (lines 216-264) with:

<StageButton
  signalType="review_issue"
  content={issue.title}  // Use title as the main signal
  source="review_analysis"
  workspaceId={workspaceId}
  sourceAppId={appId || ""}
  metadata={{
    description: issue.description,
    severity: issue.severity,
    impact: issue.impact,
    quote: issue.quote,
  }}
  onStaged={() => {
    // Optional: update UI to show "Staged" state
    // E.g., disable button, change color, etc
  }}
  variant="primary"
  size="md"
  label={
    // Show localized label based on issue language
    issue.language?.startsWith("ar")
      ? "إضافة إلى الخزنة"
      : "Add to Vault"
  }
/>
```

---

### 2. Market Intelligence Page — MarketIntelligenceClient.tsx (Lines 142-207)

**Current Code:**
```typescript
// ❌ BEFORE: Navigation-based
function OptimizeWithSpotlightButton({
  spotlight,
  workspaceId,
  isRtl,
}: {
  spotlight: KeywordSpotlightResult;
  workspaceId: string;
  isRtl: boolean;
}) {
  const router = useRouter();

  function handleClick() {
    // Encode keywords as URL params
    const targets = spotlight.trendingKeywords
      .slice(0, 8)
      .map((kw) => `market_spotlight:${kw}`)
      .join(",");

    const params = new URLSearchParams();
    params.set("exploit_targets", targets);
    if (spotlight.asoTip) {
      params.set("market_tip", encodeURIComponent(spotlight.asoTip));
    }

    router.push(`/app/${workspaceId}/listing-optimizer?${params.toString()}`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={...}
    >
      {/* Button content */}
    </button>
  );
}
```

**Problems:**
- Passes keywords via URL params (not persisted)
- Navigates away immediately
- No vault integration
- Keywords lost if page refreshed

**✅ REPLACEMENT:**

Replace entire function with:

```typescript
import { StageButton } from "@/components/staging/StageButton";

function OptimizeWithSpotlightButton({
  spotlight,
  workspaceId,
  appId,  // Add this prop if not present
  isRtl,
}: {
  spotlight: KeywordSpotlightResult;
  workspaceId: string;
  appId?: string;
  isRtl: boolean;
}) {
  // Transform trending keywords into bulk staging
  const handleStageMultiple = async () => {
    // This is handled by StageButton internally
    // Just pass the first keyword for now, or handle multiple via parent
    return true;
  };

  return (
    <StageButton
      signalType="keyword"
      content={spotlight.trendingKeywords.slice(0, 3).join(", ")}  // Top 3 keywords
      source="keyword_spotlight"
      workspaceId={workspaceId}
      sourceAppId={appId || ""}
      language={isRtl ? "ar" : "en"}
      metadata={{
        trendingKeywords: spotlight.trendingKeywords,  // All keywords in metadata
        asoTip: spotlight.asoTip,
        keywordCount: spotlight.trendingKeywords.length,
      }}
      variant="primary"
      size="lg"
      label={
        isRtl
          ? "إضافة إلى الخزنة"
          : "Stage to Vault"
      }
    />
  );
}
```

---

### 3. Competitor Spy Page — CompetitorSpySnapshotCard.tsx

**Current Code (Lines 206-216):**
```typescript
// ❌ BEFORE: Navigation-based
<TooltipProvider>
  <Tooltip
    content={t("sendOptimizerTooltip")}
    side="top"
    className="max-w-[280px]"
    asChild
  >
    <Button
      type="button"
      className="w-full bg-emerald-600 text-white hover:bg-emerald-500 sm:flex-1"
      onClick={onSendToOptimizer}
    >
      <span className="inline-flex items-center justify-center gap-2">
        <Sparkles className="size-4 shrink-0 opacity-90" aria-hidden />
        {t("sendOptimizer")}
      </span>
    </Button>
  </Tooltip>
</TooltipProvider>
```

**Problems:**
- Uses `onSendToOptimizer` callback that navigates away
- No vault integration
- Data not persisted

**✅ REPLACEMENT:**

Replace the entire TooltipProvider section (lines 199-217) with:

```typescript
<StageButton
  signalType="competitor_weakness"
  content={`${competitorDisplayName}: ${liveTitle || displayName}`}
  source="competitor_spy"
  workspaceId={workspaceId}
  sourceAppId=""  // Will need to be passed in as prop
  language={isRtl ? "ar" : "en"}
  metadata={{
    competitorName: competitorDisplayName,
    competitorPackageId: packageId,
    categoryLabel,
    bestRank,
    metricsKeywordCount,
    displayName,
  }}
  variant="primary"
  size="md"
  className="w-full sm:flex-1"
  label={t("sendOptimizer")}
/>
```

**Props Changes Needed:**
Add to `CompetitorSpySnapshotCardProps`:
```typescript
workspaceId: string;  // NEW — required for StageButton
appId?: string;       // NEW — optional app ID
```

Then update where component is called to pass these props.

---

## Step-by-Step Replacement Guide

### For Reviews Page (IssueCard.tsx)

**Step 1: Add import**
```typescript
import { StageButton } from "@/components/staging/StageButton";
```

**Step 2: Remove old state variables**
```typescript
// DELETE these lines:
const [status, setStatus] = React.useState<PipelineStatus>(added ? "STAGED" : "AVAILABLE");
const [busy, setBusy] = React.useState(false);
const cta = CTA_CONFIG[status];
```

**Step 3: Remove handleClick function**
```typescript
// DELETE lines 144-163
async function handleClick() { ... }
```

**Step 4: Remove old button rendering**
```typescript
// DELETE lines 216-264 (entire TooltipProvider section)
```

**Step 5: Add StageButton**
```typescript
// Insert in CardContent where button was:
<StageButton
  signalType="review_issue"
  content={issue.title}
  source="review_analysis"
  workspaceId={workspaceId}
  sourceAppId={appId || ""}
  language={issue.language || "en"}
  metadata={{
    description: issue.description,
    severity: issue.severity,
    impactPercent: Math.round(issue.impact * 100),
    quote: issue.quote,
  }}
  variant="primary"
  className="mt-4 w-full sm:w-auto"
/>
```

**Step 6: Remove unused imports**
```typescript
// DELETE: import { ArrowRight, CheckCircle2, PlusCircle } from "lucide-react";
// DELETE: import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
```

---

### For Market Intelligence Page (MarketIntelligenceClient.tsx)

**Step 1: Add import**
```typescript
import { StageButton } from "@/components/staging/StageButton";
```

**Step 2: Replace OptimizeWithSpotlightButton function (lines 142-207)**
```typescript
function OptimizeWithSpotlightButton({
  spotlight,
  workspaceId,
  ownAppId,  // Pass app ID from parent
  isRtl,
}: {
  spotlight: KeywordSpotlightResult;
  workspaceId: string;
  ownAppId?: string | null;
  isRtl: boolean;
}) {
  return (
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
  );
}
```

**Step 3: Update caller to pass ownAppId**
```typescript
// Find where OptimizeWithSpotlightButton is called, add ownAppId prop:
<OptimizeWithSpotlightButton
  spotlight={data}
  workspaceId={workspaceId}
  ownAppId={ownAppId}  // Add this line
  isRtl={isRtl}
/>
```

**Step 4: Remove unused imports**
```typescript
// DELETE: import { ArrowRight, Wand2 } from "lucide-react";
// DELETE: import { useRouter } from "@/i18n/navigation";
```

---

### For Competitor Spy Page (CompetitorSpySnapshotCard.tsx)

**Step 1: Add import**
```typescript
import { StageButton } from "@/components/staging/StageButton";
```

**Step 2: Add props**
```typescript
export type CompetitorSpySnapshotCardProps = {
  // ... existing props ...
  workspaceId: string;  // NEW
  appId?: string;       // NEW
};
```

**Step 3: Destructure props in component**
```typescript
export function CompetitorSpySnapshotCard({
  isRtl,
  workspaceAppName,
  competitorDisplayName,
  displayName,
  categoryLabel,
  packageId,
  bestRank,
  metricsKeywordCount,
  liveTitle,
  rankLabels,
  workspaceId,    // NEW
  appId,          // NEW
  onSendToOptimizer,
  onManageCompetitors,
  manageCompetitorsLabel,
}: CompetitorSpySnapshotCardProps) {
```

**Step 4: Replace TooltipProvider section (lines 199-217)**
```typescript
// DELETE these lines:
<TooltipProvider>
  <Tooltip
    content={t("sendOptimizerTooltip")}
    side="top"
    className="max-w-[280px]"
    asChild
  >
    <Button
      type="button"
      className="w-full bg-emerald-600 text-white hover:bg-emerald-500 sm:flex-1"
      onClick={onSendToOptimizer}
    >
      <span className="inline-flex items-center justify-center gap-2">
        <Sparkles className="size-4 shrink-0 opacity-90" aria-hidden />
        {t("sendOptimizer")}
      </span>
    </Button>
  </Tooltip>
</TooltipProvider>

// REPLACE WITH:
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
    displayName,
  }}
  variant="primary"
  size="md"
  className="w-full sm:flex-1"
  label={t("sendOptimizer")}
/>
```

**Step 5: Remove unused imports/callbacks**
```typescript
// DELETE: onSendToOptimizer prop (no longer needed)
// DELETE: import { Sparkles } from "lucide-react";
// DELETE: TooltipProvider and Tooltip (no longer needed)
```

**Step 6: Update the caller**
Find where `CompetitorSpySnapshotCard` is used and add props:
```typescript
<CompetitorSpySnapshotCard
  // ... existing props ...
  workspaceId={workspaceId}  // NEW
  appId={appId}              // NEW
/>
```

---

## File-by-File Checklist

```
REVIEWS PAGE (IssueCard.tsx):
☐ Add: import { StageButton } from "@/components/staging/StageButton";
☐ Delete: const [status, setStatus] = React.useState(...);
☐ Delete: const [busy, setBusy] = React.useState(...);
☐ Delete: const cta = CTA_CONFIG[status];
☐ Delete: async function handleClick() { ... }
☐ Delete: TooltipProvider section (lines 217-264)
☐ Delete unused imports: ArrowRight, CheckCircle2, PlusCircle, TooltipProvider, etc.
☐ Add: <StageButton /> with review metadata
☐ Update props if needed

REVIEWS PAGE (ReviewsClient.tsx):
☐ No changes needed — passes props to IssueCard
☐ Verify IssueCard works after changes

MARKET INTELLIGENCE (MarketIntelligenceClient.tsx):
☐ Add: import { StageButton } from "@/components/staging/StageButton";
☐ Delete: function OptimizeWithSpotlightButton() { ... } (entire function)
☐ Replace with new function using StageButton
☐ Find where OptimizeWithSpotlightButton is called
☐ Add ownAppId prop to caller
☐ Delete unused imports: ArrowRight, Wand2, useRouter
☐ Test with multiple keywords

COMPETITOR SPY PAGE (CompetitorSpySnapshotCard.tsx):
☐ Add: import { StageButton } from "@/components/staging/StageButton";
☐ Add props: workspaceId, appId
☐ Destructure new props in function signature
☐ Delete: TooltipProvider section (lines 199-217)
☐ Replace with: <StageButton /> with competitor metadata
☐ Delete unused imports: Sparkles, Tooltip, TooltipProvider
☐ Delete: onSendToOptimizer callback
☐ Find caller of CompetitorSpySnapshotCard
☐ Pass workspaceId and appId props to component

TOAST SETUP:
☐ Verify ToastContainer in root layout
☐ Test toasts appear after staging
```

---

## Testing Workflow

### 1. Reviews Page Test
```
1. Go to Reviews page
2. Click StageButton on an issue
3. Toast appears: "Successfully Staged"
4. Button stays on page (no navigation)
5. Go to Optimizer page
6. Vault shows staged issue in "Issues to Address"
```

### 2. Market Intelligence Test
```
1. Go to Market Intelligence page
2. Generate Spotlight (if not cached)
3. Click StageButton on spotlight
4. Toast appears: "Successfully Staged"
5. Page stays on Market Intelligence
6. Go to Optimizer page
7. Vault shows keywords in "Keywords" section
```

### 3. Vault Persistence Test
```
1. Stage issue from Reviews
2. Stage keywords from Market Intelligence
3. Refresh page (Optimizer)
4. Vault signals still appear (auto-fetched)
5. Signals persist across sessions
```

---

## Notes on Current Implementation

- **IssueCard.tsx** uses a 2-step state machine (AVAILABLE → STAGED) that's now unnecessary
- **MarketIntelligenceClient.tsx** loses data when navigating (URL params don't persist)
- Both rely on `router.push()` which breaks the "stay on page" requirement
- Neither integrates with the Staging Vault persistent storage

**After replacement:**
- ✅ Single-step staging (no state machine)
- ✅ Data persists in database immediately
- ✅ No page navigation (better UX)
- ✅ Toast notifications confirm action
- ✅ Full RTL support for Arabic

---

## Files to Modify

1. `components/reviews/IssueCard.tsx` — Replace handleClick + button rendering
2. `components/market/MarketIntelligenceClient.tsx` — Replace OptimizeWithSpotlightButton function
3. `components/[competitors]/[Unknown].tsx` — Once located, follow same pattern

---

**Status:** ✅ Ready for implementation

Start with IssueCard.tsx, then MarketIntelligenceClient.tsx. Once you locate the Competitor Spy button, apply the same pattern.
