# Visual Implementation Guide — Exact File Locations

**Status:** Step-by-step with screenshots of what to change  
**Date:** June 4, 2026

---

## Overview Map

```
Your Project Root
├── components/
│   ├── reviews/
│   │   └── IssueCard.tsx ← CHANGE #1 (Lines 131-263)
│   ├── market/
│   │   └── MarketIntelligenceClient.tsx ← CHANGE #2 (Lines 142-207)
│   ├── competitor-spy/
│   │   └── competitor-spy-snapshot-card.tsx ← CHANGE #3 (Lines 206-216)
│   └── staging/
│       └── StageButton.tsx ← USE THIS (Already created)
├── hooks/
│   ├── useToast.ts ← ALREADY CREATED
│   └── useVault.ts ← ALREADY CREATED
└── components/
    └── Toast.tsx ← ALREADY CREATED
```

---

## CHANGE #1: Reviews Page (IssueCard.tsx)

### Location & File Info
```
File: components/reviews/IssueCard.tsx
Lines to Delete: 131-163 (handleClick function + state)
Lines to Replace: 216-264 (button rendering)
New Lines: ~20 (StageButton component)
```

### What It Looks Like NOW ❌

```typescript
// Line 131-163: This function needs to go
export function IssueCard({ issue, workspaceId, appId, added, onAdd }: IssueCardProps) {
  const router = useRouter();
  const config = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.MEDIUM;
  const impactPct = Math.round(issue.impact * 100);

  // ❌ DELETE THESE:
  const [status, setStatus] = React.useState<PipelineStatus>(
    added ? "STAGED" : "AVAILABLE",
  );
  const [busy, setBusy] = React.useState(false);

  const cta = CTA_CONFIG[status];

  async function handleClick() {
    if (busy) return;

    if (status === "STAGED") {
      const qs = appId ? `?appId=${encodeURIComponent(appId)}` : "";
      router.push(`/app/${workspaceId}/listing-optimizer${qs}`);
      return;
    }

    setBusy(true);
    try {
      const ok = await onAdd();
      if (ok) setStatus("STAGED");
    } finally {
      setBusy(false);
    }
  }
```

### What It Should Look Like NOW ✅

```typescript
// Line 131 onwards: Simplified
import { StageButton } from "@/components/staging/StageButton"; // ← ADD THIS IMPORT

export function IssueCard({ issue, workspaceId, appId, added, onAdd }: IssueCardProps) {
  const router = useRouter();
  const config = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.MEDIUM;
  const impactPct = Math.round(issue.impact * 100);

  // ✅ DELETE old state variables
  // ✅ DELETE handleClick function
```

### Button Section NOW ❌

Lines 216-264 (entire TooltipProvider section):
```typescript
{/* ── Pipeline CTA ── */}
<TooltipProvider delayDuration={400}>
  <TooltipRoot>
    <TooltipTrigger asChild>
      <span
        role="button"
        tabIndex={0}
        aria-busy={busy}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleClick();
        }}
        className={...}
      >
        {busy ? (
          <svg className="size-3.5 animate-spin shrink-0" {...}>
            {/* spinner */}
          </svg>
        ) : (
          cta.icon
        )}
        {busy ? "Saving…" : cta.label}
      </span>
    </TooltipTrigger>

    <TooltipContent side="top" className="max-w-[260px]">
      {cta.tooltip}
    </TooltipContent>
  </TooltipRoot>
</TooltipProvider>
```

### Button Section SHOULD BE ✅

Replace entire section with:
```typescript
{/* ── Staging Vault CTA ── */}
<StageButton
  signalType="review_issue"
  content={issue.title}
  source="review_analysis"
  workspaceId={workspaceId}
  sourceAppId={appId || ""}
  language="en" // or detect from issue
  metadata={{
    description: issue.description,
    severity: issue.severity,
    impactPercent: impactPct,
    quote: issue.quote,
  }}
  onStaged={() => {
    // Optional: refresh or show feedback
  }}
  variant="primary"
  size="md"
  className="mt-1 w-full"
/>
```

### Cleanup: Remove These Imports ❌

```typescript
// DELETE FROM TOP OF FILE:
import { ArrowRight, CheckCircle2, PlusCircle } from "lucide-react";
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// DELETE: const CTA_CONFIG (lines 64-106)
// DELETE: type PipelineStatus (line 19)
// DELETE: type CtaConfig (lines 57-62)
```

---

## CHANGE #2: Market Intelligence Page (MarketIntelligenceClient.tsx)

### Location & File Info
```
File: components/market/MarketIntelligenceClient.tsx
Function to Replace: OptimizeWithSpotlightButton (Lines 142-207)
New Function: ~20 lines (StageButton component)
```

### What It Looks Like NOW ❌

```typescript
// Lines 142-207: This entire function needs replacing
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
    // ❌ This navigates away!
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
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm font-semibold transition-all duration-150",
        "border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-200",
        "hover:border-emerald-500/60 hover:bg-emerald-500/[0.14] hover:text-emerald-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50",
        isRtl && "flex-row-reverse font-arabic",
      )}
    >
      {/* Button content */}
    </button>
  );
}
```

### What It Should Look Like NOW ✅

```typescript
// Lines 142-207: Replace with this
import { StageButton } from "@/components/staging/StageButton"; // ← ADD

function OptimizeWithSpotlightButton({
  spotlight,
  workspaceId,
  ownAppId, // ← ADD THIS PROP
  isRtl,
}: {
  spotlight: KeywordSpotlightResult;
  workspaceId: string;
  ownAppId?: string | null; // ← ADD
  isRtl: boolean;
}) {
  // ✅ DELETE: const router = useRouter();
  // ✅ DELETE: function handleClick() { ... }

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

### Find the Caller (Update This Too) 🔍

Search for where `OptimizeWithSpotlightButton` is used:

**BEFORE ❌:**
```typescript
<OptimizeWithSpotlightButton
  spotlight={data}
  workspaceId={workspaceId}
  isRtl={isRtl}
/>
```

**AFTER ✅:**
```typescript
<OptimizeWithSpotlightButton
  spotlight={data}
  workspaceId={workspaceId}
  ownAppId={ownAppId}  // ← ADD THIS
  isRtl={isRtl}
/>
```

### Cleanup: Remove These Imports ❌

```typescript
// DELETE FROM TOP:
import { ArrowRight, Wand2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
```

---

## CHANGE #3: Competitor Spy Page (CompetitorSpySnapshotCard.tsx)

### Location & File Info
```
File: components/competitor-spy/competitor-spy-snapshot-card.tsx
Props to Update: Lines 43-57 (add 2 new props)
Button to Replace: Lines 199-217
```

### What It Looks Like NOW ❌

Props section (Line 43-57):
```typescript
export type CompetitorSpySnapshotCardProps = {
  isRtl: boolean;
  workspaceAppName: string;
  competitorDisplayName: string;
  displayName: string;
  categoryLabel: string;
  packageId: string;
  bestRank: number | null;
  metricsKeywordCount: number;
  liveTitle?: string | null;
  rankLabels: RankDisplayLabels;
  onSendToOptimizer: () => void; // ← REMOVE THIS
  onManageCompetitors: () => void;
  manageCompetitorsLabel: string;
  // ❌ MISSING: workspaceId, appId
};
```

Button section (Lines 199-217):
```typescript
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

### What It Should Look Like NOW ✅

Props section (Line 43-57):
```typescript
import { StageButton } from "@/components/staging/StageButton"; // ← ADD

export type CompetitorSpySnapshotCardProps = {
  isRtl: boolean;
  workspaceAppName: string;
  competitorDisplayName: string;
  displayName: string;
  categoryLabel: string;
  packageId: string;
  bestRank: number | null;
  metricsKeywordCount: number;
  liveTitle?: string | null;
  rankLabels: RankDisplayLabels;
  workspaceId: string; // ← ADD THIS
  appId?: string; // ← ADD THIS
  // ✅ REMOVE: onSendToOptimizer: () => void;
  onManageCompetitors: () => void;
  manageCompetitorsLabel: string;
};
```

Function signature (Line 59):
```typescript
// BEFORE ❌:
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
  onSendToOptimizer,  // ← REMOVE
  onManageCompetitors,
  manageCompetitorsLabel,
}: CompetitorSpySnapshotCardProps) {

// AFTER ✅:
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
  workspaceId, // ← ADD
  appId, // ← ADD
  onManageCompetitors,
  manageCompetitorsLabel,
}: CompetitorSpySnapshotCardProps) {
```

Button section (Lines 199-217):
```typescript
// REPLACE THIS:
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

// WITH THIS:
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

### Find the Caller (Update This Too) 🔍

Search for where `CompetitorSpySnapshotCard` is used:

**BEFORE ❌:**
```typescript
<CompetitorSpySnapshotCard
  isRtl={isRtl}
  workspaceAppName={workspaceAppName}
  competitorDisplayName={competitorDisplayName}
  displayName={displayName}
  categoryLabel={categoryLabel}
  packageId={packageId}
  bestRank={bestRank}
  metricsKeywordCount={metricsKeywordCount}
  liveTitle={liveTitle}
  rankLabels={rankLabels}
  onSendToOptimizer={handleSendToOptimizer}  // ← REMOVE
  onManageCompetitors={handleManageCompetitors}
  manageCompetitorsLabel={manageCompetitorsLabel}
/>
```

**AFTER ✅:**
```typescript
<CompetitorSpySnapshotCard
  isRtl={isRtl}
  workspaceAppName={workspaceAppName}
  competitorDisplayName={competitorDisplayName}
  displayName={displayName}
  categoryLabel={categoryLabel}
  packageId={packageId}
  bestRank={bestRank}
  metricsKeywordCount={metricsKeywordCount}
  liveTitle={liveTitle}
  rankLabels={rankLabels}
  workspaceId={workspaceId}  // ← ADD THIS
  appId={appId}  // ← ADD THIS
  onManageCompetitors={handleManageCompetitors}
  manageCompetitorsLabel={manageCompetitorsLabel}
/>
```

### Cleanup: Remove These Imports ❌

```typescript
// DELETE FROM TOP:
import { Sparkles } from "lucide-react";
import { TooltipProvider, Tooltip } from "@/components/ui/tooltip";
```

---

## Step-by-Step Implementation Checklist

### Step 1: Setup (5 minutes)
```
☐ Open components/reviews/IssueCard.tsx
☐ Open components/market/MarketIntelligenceClient.tsx
☐ Open components/competitor-spy/competitor-spy-snapshot-card.tsx
☐ Verify StageButton.tsx exists in components/staging/
☐ Verify ToastContainer added to root layout
```

### Step 2: IssueCard.tsx (10 minutes)
```
☐ Line 1: Add import { StageButton }
☐ Lines 131-163: DELETE state variables and handleClick
☐ Lines 216-264: DELETE entire TooltipProvider section
☐ After CardContent opening: ADD <StageButton /> code
☐ Top of file: DELETE unused imports (ArrowRight, CheckCircle2, PlusCircle, Tooltip*)
☐ DELETE: CTA_CONFIG, PipelineStatus, CtaConfig types
☐ Save file
```

### Step 3: MarketIntelligenceClient.tsx (10 minutes)
```
☐ Line 1: Add import { StageButton }
☐ Line 142-207: DELETE entire OptimizeWithSpotlightButton function
☐ ADD new OptimizeWithSpotlightButton function (from guide above)
☐ FIND where OptimizeWithSpotlightButton is called
☐ ADD ownAppId prop to the call
☐ Top of file: DELETE unused imports (ArrowRight, Wand2, useRouter)
☐ Save file
```

### Step 4: CompetitorSpySnapshotCard.tsx (15 minutes)
```
☐ Line 1: Add import { StageButton }
☐ Lines 43-57: UPDATE props type to add workspaceId, appId
☐ Line 59: UPDATE function signature to destructure new props
☐ Lines 199-217: DELETE TooltipProvider section
☐ ADD <StageButton /> code in same location
☐ Top of file: DELETE unused imports (Sparkles, TooltipProvider, Tooltip)
☐ DELETE: onSendToOptimizer prop from function signature
☐ FIND where component is called
☐ ADD workspaceId and appId props to the call
☐ REMOVE onSendToOptimizer prop from the call
☐ Save file
```

### Step 5: Testing (10 minutes)
```
☐ Go to Reviews page
☐ Click StageButton on an issue
☐ Verify toast appears: "Successfully Staged"
☐ Go to Market Intelligence page
☐ Click StageButton on spotlight
☐ Verify toast appears
☐ Go to Competitor Spy page
☐ Click StageButton on competitor
☐ Verify toast appears
☐ Go to Optimizer page
☐ Verify vault shows all 3 staged signals
☐ Test with Arabic locale if available
```

---

## What To Look For: Before vs After

### Before ❌
- Clicking button → page navigates away
- No toast notification
- Data in URL params
- Can't find staged signals later

### After ✅
- Clicking button → stays on page
- Toast appears: "Successfully Staged"
- Data in database immediately
- Go to Optimizer → signals appear automatically
- Works in Arabic/English

---

## File Locations Quick Reference

```
MacOS/Linux Path Structure:
/Users/syedmairaj/Documents/playstore/
├── components/
│   ├── reviews/IssueCard.tsx
│   ├── market/MarketIntelligenceClient.tsx
│   ├── competitor-spy/competitor-spy-snapshot-card.tsx
│   ├── staging/
│   │   └── StageButton.tsx (USE THIS)
│   └── Toast.tsx (ALREADY CREATED)
└── hooks/
    ├── useToast.ts (ALREADY CREATED)
    └── useVault.ts (ALREADY CREATED)
```

---

## Common Issues & Fixes

### Issue: StageButton import not found
**Fix:** Verify path is `@/components/staging/StageButton`

### Issue: Toast not appearing
**Fix:** Check root layout has `<ToastContainer />` added

### Issue: Prop errors on component calls
**Fix:** Make sure you updated BOTH the component AND the caller with new props

### Issue: Old button still showing
**Fix:** Verify you deleted entire TooltipProvider/Button section (lines 199-217 etc)

---

**Status:** ✅ Ready to implement

Total time: ~50 minutes for all 3 files + testing

Start with IssueCard.tsx (simplest), then Market Intelligence, then Competitor Spy.

All changes are copy-paste ready!
