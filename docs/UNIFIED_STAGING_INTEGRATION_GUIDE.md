# Unified Staging Vault Integration Guide

**Purpose:** Standardize the Staging Vault integration across all five modules with unified state management, auto-archive functionality, and real-time Optimizer synchronization.

**Status:** Complete implementation guide with module-specific examples

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Concepts](#core-concepts)
3. [Module Integration Examples](#module-integration-examples)
4. [State Management Pattern](#state-management-pattern)
5. [Optimizer Synchronization](#optimizer-synchronization)
6. [Testing & Validation](#testing--validation)

---

## Architecture Overview

### Flow Diagram

```
User Action (Stage Button Click)
    ↓
UnifiedStageButton Component
    ├─ API Call: POST /api/workspaces/{id}/staging/add
    ├─ Wait for Response
    └─ On Success:
        ├─ Move to Archive (Local State)
        ├─ Execute onStageSuccess Callback
        ├─ Trigger Optimizer Sync (useOptimizerSync)
        ├─ Update Vault Context
        └─ Show Toast Notification

Optimizer Updates in Real-Time
    ├─ SWR Hook Detects Change
    ├─ Revalidates /api/workspaces/{id}/optimizer/context
    ├─ Updates Active Context with Staged Item
    └─ Components Re-render
```

### Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `UnifiedStageButton` | Enhanced stage button with callbacks and sync | `components/staging/UnifiedStageButton.tsx` |
| `unified-staging-state` | Core state management utilities | `lib/staging/unified-staging-state.ts` |
| `module-implementations` | Module-specific state and callbacks | `lib/staging/module-implementations.ts` |
| `useOptimizerSync` | SWR hook for real-time Optimizer updates | `hooks/useOptimizerSync.ts` |

---

## Core Concepts

### 1. Unified State Pattern

All modules follow the same state management pattern:

```typescript
// Active items currently displayed
const [activeItems, setActiveItems] = useState([]);

// Items moved to archive
const [archivedItems, setArchivedItems] = useState([]);

// Archive state manager handles transitions
const archiveManager = createArchiveStateManager(
  activeItems,
  setActiveItems,
  archivedItems,
  setArchivedItems
);
```

### 2. Auto-Archive on Stage Success

When an item is staged, it automatically moves from "Active" to "Archive" view:

```typescript
const handleStageSuccess = async (params: OnStageSuccessParams) => {
  // Move from active to archive
  archiveManager.moveToArchive(params.payload.signalId, "staged");

  // Item disappears from Active view
  // Item appears in Archive/History view
};
```

### 3. Optimizer Synchronization

After staging, the Optimizer's "Active Context" updates in real-time:

```typescript
const { mutate } = useOptimizerSync(workspaceId);

// In stage callback:
await mutate(); // Triggers SWR revalidation
// Optimizer automatically fetches updated context
// UI updates with new staged item
```

### 4. Localization Support

All messages support RTL languages (AR, HE, FA, UR):

```typescript
const message = getLocaleMessage(language, "moved_to_archive");
// "تم النقل إلى السجل" (AR)
// "Moved to optimization history" (EN)
```

---

## Module Integration Examples

### REVIEWS Module (Common Issues)

**File:** `components/reviews/IssueCard.tsx` or parent component

```typescript
import { useState, useCallback } from "react";
import { useLocale } from "next-intl";
import { UnifiedStageButton } from "@/components/staging/UnifiedStageButton";
import { useOptimizerSync } from "@/hooks/useOptimizerSync";
import {
  initializeReviewsModuleState,
  createReviewsStageCallback,
} from "@/lib/staging/module-implementations";

export function ReviewsCommonIssues({
  workspaceId,
  appId,
  initialIssues,
}: {
  workspaceId: string;
  appId: string;
  initialIssues: ReviewIssueArchiveItem[];
}) {
  const locale = useLocale();
  const { mutate: mutateStagingVault } = useOptimizerSync(workspaceId);

  // Initialize unified state
  const [state, setState] = useState(() =>
    initializeReviewsModuleState(initialIssues)
  );

  // Create stage callback
  const handleStageSuccess = useCallback(
    createReviewsStageCallback(
      state.archiveManager,
      workspaceId,
      locale,
      mutateStagingVault
    ),
    [state.archiveManager, workspaceId, locale, mutateStagingVault]
  );

  return (
    <div>
      {/* Active Issues Section */}
      <section>
        <h2>Common Issues</h2>
        <ul>
          {state.activeIssues.map((issue) => (
            <li key={issue.id}>
              <div>
                <h3>{issue.title}</h3>
                <p>{issue.description}</p>
              </div>
              <UnifiedStageButton
                signalType="review_issue"
                signalId={issue.id}
                content={issue.title}
                source="review_analysis"
                sourceAppId={appId}
                workspaceId={workspaceId}
                language={locale}
                metadata={{
                  description: issue.description,
                  severity: issue.severity,
                  impactPercent: issue.impactPercent,
                }}
                onStageSuccess={handleStageSuccess}
                onArchiveItem={(id) => {
                  // This is called automatically
                  // But can be used for custom UI updates
                  console.log("Issue being archived:", id);
                }}
                optimizerMutate={mutateStagingVault}
                syncOptimizer={true}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Archive Section */}
      <section>
        <h2>
          Optimization History ({state.archivedIssues.length})
        </h2>
        <ul>
          {state.archivedIssues.map((issue) => (
            <li key={issue.id}>
              <div>
                <h3>{issue.title}</h3>
                <small>
                  Archived: {new Date(issue._archivedAt!).toLocaleDateString()}
                </small>
              </div>
              <button
                onClick={() => {
                  state.archiveManager.moveFromArchive(issue.id);
                }}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

---

### COMPETITOR SPY Module (Snapshot Cards)

**File:** `components/competitor-spy/competitor-spy-snapshot-card.tsx` or parent

```typescript
import { useState, useCallback } from "react";
import { useLocale } from "next-intl";
import { UnifiedStageButton } from "@/components/staging/UnifiedStageButton";
import { useOptimizerSync } from "@/hooks/useOptimizerSync";
import {
  initializeCompetitorSpyModuleState,
  createCompetitorSpyStageCallback,
} from "@/lib/staging/module-implementations";

export function CompetitorSpyCardWithArchive({
  workspaceId,
  appId,
  competitors,
}: {
  workspaceId: string;
  appId: string;
  competitors: CompetitorWeaknessArchiveItem[];
}) {
  const locale = useLocale();
  const isRtl = locale === "ar";
  const { mutate: mutateStagingVault } = useOptimizerSync(workspaceId);

  const [state, setState] = useState(() =>
    initializeCompetitorSpyModuleState(competitors)
  );

  const handleStageSuccess = useCallback(
    createCompetitorSpyStageCallback(
      state.archiveManager,
      workspaceId,
      locale,
      mutateStagingVault
    ),
    [state.archiveManager, workspaceId, locale, mutateStagingVault]
  );

  return (
    <div dir={isRtl ? "rtl" : "ltr"}>
      {/* Active Competitors */}
      <div>
        <h2>Competitor Analysis</h2>
        <div className="grid gap-4">
          {state.activeWeaknesses.map((comp) => (
            <div
              key={comp.id}
              className="rounded-lg border p-4"
            >
              <h3>{comp.competitorName}</h3>
              <p className="text-sm text-gray-600">{comp.categoryLabel}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt>Best Rank</dt>
                  <dd className="font-mono">{comp.bestRank ?? "N/A"}</dd>
                </div>
                <div>
                  <dt>Keywords</dt>
                  <dd>{comp.metricsKeywordCount}</dd>
                </div>
              </dl>

              <UnifiedStageButton
                signalType="competitor_weakness"
                signalId={comp.id}
                content={`${comp.competitorName}: ${comp.displayName}`}
                source="competitor_spy"
                sourceAppId={appId}
                workspaceId={workspaceId}
                language={locale}
                metadata={{
                  competitorName: comp.competitorName,
                  competitorPackageId: comp.competitorPackageId,
                  categoryLabel: comp.categoryLabel,
                  bestRank: comp.bestRank,
                  metricsKeywordCount: comp.metricsKeywordCount,
                }}
                onStageSuccess={handleStageSuccess}
                optimizerMutate={mutateStagingVault}
                syncOptimizer={true}
                size="md"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Archive */}
      {state.archivedWeaknesses.length > 0 && (
        <div className="mt-8">
          <h2>Analysis Archive ({state.archivedWeaknesses.length})</h2>
          <ul>
            {state.archivedWeaknesses.map((comp) => (
              <li key={comp.id} className="flex justify-between py-2">
                <span>{comp.competitorName}</span>
                <button
                  onClick={() => state.archiveManager.moveFromArchive(comp.id)}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

### MARKET INTEL Module (Trending Keywords)

**File:** `components/market/MarketIntelligenceClient.tsx` or parent

```typescript
import { useState, useCallback } from "react";
import { useLocale } from "next-intl";
import { UnifiedStageButton } from "@/components/staging/UnifiedStageButton";
import { useOptimizerSync } from "@/hooks/useOptimizerSync";
import {
  initializeMarketIntelModuleState,
  createMarketIntelStageCallback,
} from "@/lib/staging/module-implementations";

export function MarketIntelSpotlight({
  workspaceId,
  appId,
  trendingKeywords,
}: {
  workspaceId: string;
  appId: string;
  trendingKeywords: TrendingKeywordArchiveItem[];
}) {
  const locale = useLocale();
  const { mutate: mutateStagingVault } = useOptimizerSync(workspaceId);

  const [state, setState] = useState(() =>
    initializeMarketIntelModuleState(trendingKeywords)
  );

  const handleStageSuccess = useCallback(
    createMarketIntelStageCallback(
      state.archiveManager,
      workspaceId,
      locale,
      mutateStagingVault
    ),
    [state.archiveManager, workspaceId, locale, mutateStagingVault]
  );

  return (
    <div>
      <h2>Trending Keywords</h2>

      {/* Active Keywords */}
      <div className="space-y-3">
        {state.activeTrendingKeywords.map((kw) => (
          <div key={kw.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{kw.keyword}</h3>
                <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                  <div>
                    <span className="text-gray-500">Volume</span>
                    <p className="font-mono">{kw.searchVolume}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Difficulty</span>
                    <p className="font-mono">{kw.difficulty}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Trend</span>
                    <p>{kw.trend}</p>
                  </div>
                </div>
              </div>

              <UnifiedStageButton
                signalType="keyword"
                signalId={kw.id}
                content={kw.keyword}
                source="keyword_spotlight"
                sourceAppId={appId}
                workspaceId={workspaceId}
                language={locale}
                metadata={{
                  searchVolume: kw.searchVolume,
                  difficulty: kw.difficulty,
                  trend: kw.trend,
                }}
                onStageSuccess={handleStageSuccess}
                optimizerMutate={mutateStagingVault}
                syncOptimizer={true}
                size="sm"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Archive */}
      {state.archivedTrendingKeywords.length > 0 && (
        <div className="mt-8">
          <h2>Reviewed Keywords ({state.archivedTrendingKeywords.length})</h2>
          <ul className="text-sm space-y-2">
            {state.archivedTrendingKeywords.map((kw) => (
              <li key={kw.id} className="flex justify-between">
                <span>{kw.keyword}</span>
                <button
                  onClick={() => state.archiveManager.moveFromArchive(kw.id)}
                  className="text-blue-500 hover:underline"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

### KEYWORD TRACKER Module (AI Suggestions)

**File:** `components/keyword-tracker/KeywordTrackerClient.tsx`

```typescript
import { useState, useCallback } from "react";
import { useLocale } from "next-intl";
import { UnifiedStageButton } from "@/components/staging/UnifiedStageButton";
import { useOptimizerSync } from "@/hooks/useOptimizerSync";
import {
  initializeKeywordTrackerModuleState,
  createKeywordTrackerStageCallback,
} from "@/lib/staging/module-implementations";

export function KeywordTrackerAISuggestions({
  workspaceId,
  appId,
  aiSuggestedKeywords,
  selectedMarket,
}: {
  workspaceId: string;
  appId: string;
  aiSuggestedKeywords: TrackedKeywordArchiveItem[];
  selectedMarket: string;
}) {
  const locale = useLocale();
  const isRtl = locale === "ar";
  const { mutate: mutateStagingVault } = useOptimizerSync(workspaceId);

  const [state, setState] = useState(() =>
    initializeKeywordTrackerModuleState(aiSuggestedKeywords)
  );

  const handleStageSuccess = useCallback(
    createKeywordTrackerStageCallback(
      state.archiveManager,
      workspaceId,
      locale,
      mutateStagingVault
    ),
    [state.archiveManager, workspaceId, locale, mutateStagingVault]
  );

  return (
    <div dir={isRtl ? "rtl" : "ltr"}>
      <h2>AI Suggested Keywords</h2>

      {/* Active Suggestions */}
      <ul className="space-y-2 border rounded-lg divide-y">
        {state.activeKeywords.map((kw) => (
          <li
            key={kw.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
          >
            <span className="font-medium flex-1">{kw.keyword}</span>

            <div className={cn("flex gap-2", isRtl && "flex-row-reverse")}>
              <UnifiedStageButton
                signalType="keyword"
                signalId={kw.id}
                content={kw.keyword}
                source="keyword_tracker"
                sourceAppId={appId}
                workspaceId={workspaceId}
                language={locale}
                metadata={{
                  countryCode: selectedMarket.toUpperCase(),
                  currentRank: kw.currentRank,
                  previousRank: kw.previousRank,
                  searchVolume: kw.searchVolume,
                  difficulty: kw.difficulty,
                  market: selectedMarket,
                }}
                onStageSuccess={handleStageSuccess}
                optimizerMutate={mutateStagingVault}
                syncOptimizer={true}
                variant="secondary"
                size="sm"
              />

              <button className="px-3 py-1.5 text-sm font-medium rounded-lg border">
                Track Keyword
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Archive */}
      {state.archivedKeywords.length > 0 && (
        <div className="mt-6">
          <h3>Staged Keywords ({state.archivedKeywords.length})</h3>
          <ul className="text-sm space-y-1">
            {state.archivedKeywords.map((kw) => (
              <li key={kw.id} className="flex justify-between py-2 px-3 bg-gray-50 rounded">
                <span>{kw.keyword}</span>
                <button
                  onClick={() => state.archiveManager.moveFromArchive(kw.id)}
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

### ALERTS Module (Alert Cards)

**File:** `components/alerts/AlertsPanel.tsx`

```typescript
import { useState, useCallback } from "react";
import { useLocale } from "next-intl";
import { UnifiedStageButton } from "@/components/staging/UnifiedStageButton";
import { useOptimizerSync } from "@/hooks/useOptimizerSync";
import {
  initializeAlertsModuleState,
  createAlertsStageCallback,
} from "@/lib/staging/module-implementations";

export function AlertsPanelWithArchive({
  workspaceId,
  appId,
  initialAlerts,
}: {
  workspaceId: string;
  appId: string;
  initialAlerts: AlertArchiveItem[];
}) {
  const locale = useLocale();
  const { mutate: mutateStagingVault } = useOptimizerSync(workspaceId);

  const [state, setState] = useState(() =>
    initializeAlertsModuleState(initialAlerts)
  );

  const handleStageSuccess = useCallback(
    createAlertsStageCallback(
      state.archiveManager,
      workspaceId,
      locale,
      mutateStagingVault
    ),
    [state.archiveManager, workspaceId, locale, mutateStagingVault]
  );

  return (
    <div>
      <h2>Live Alerts</h2>

      {/* Active Alerts */}
      <ul className="space-y-3">
        {state.activeAlerts.map((alert) => (
          <li key={alert.id} className="rounded-lg border p-4">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-sm">{alert.title}</h3>
              <span
                className={cn(
                  "text-xs font-medium px-2 py-1 rounded-full",
                  {
                    "bg-red-100 text-red-800": alert.severity === "critical",
                    "bg-yellow-100 text-yellow-800": alert.severity === "warning",
                    "bg-blue-100 text-blue-800": alert.severity === "info",
                  }
                )}
              >
                {alert.severity.toUpperCase()}
              </span>
            </div>

            <p className="text-sm text-gray-600 mb-3">{alert.body}</p>

            <UnifiedStageButton
              signalType="optimization_insight"
              signalId={alert.id}
              content={`[${alert.severity.toUpperCase()}] ${alert.type}: ${alert.body}`}
              source="api"
              sourceAppId={appId}
              sourceContext="alert"
              sourceContextId={alert.id}
              workspaceId={workspaceId}
              language={locale}
              metadata={{
                alertType: alert.type,
                alertTitle: alert.title,
                severity: alert.severity,
                highPriority: alert.severity === "critical",
                detectedAt: alert.createdAt,
              }}
              onStageSuccess={handleStageSuccess}
              optimizerMutate={mutateStagingVault}
              syncOptimizer={true}
              size="sm"
            />
          </li>
        ))}
      </ul>

      {/* Archive */}
      {state.archivedAlerts.length > 0 && (
        <div className="mt-8">
          <h2>Alert History ({state.archivedAlerts.length})</h2>
          <ul className="text-sm space-y-2">
            {state.archivedAlerts.map((alert) => (
              <li
                key={alert.id}
                className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded"
              >
                <span>{alert.title}</span>
                <button
                  onClick={() => state.archiveManager.moveFromArchive(alert.id)}
                  className="text-blue-500 hover:underline"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

---

## State Management Pattern

### Base Pattern (All Modules Use This)

```typescript
// 1. Initialize state
const [state, setState] = useState(() =>
  initializeModuleState(initialItems)
);

// 2. Create stage callback
const handleStageSuccess = useCallback(
  createModuleStageCallback(
    state.archiveManager,
    workspaceId,
    locale,
    mutateStagingVault
  ),
  [state.archiveManager, workspaceId, locale, mutateStagingVault]
);

// 3. Use in UnifiedStageButton
<UnifiedStageButton
  signalType={...}
  signalId={...}
  // ... other props
  onStageSuccess={handleStageSuccess}
  optimizerMutate={mutateStagingVault}
  syncOptimizer={true}
/>

// 4. Display active & archived
{state.activeItems.map(item => <ItemComponent ... />)}
{state.archivedItems.map(item => <ArchiveItemComponent ... />)}
```

### Archive Manager Methods

```typescript
// Move to archive
archiveManager.moveToArchive(id, "staged");

// Move back to active
archiveManager.moveFromArchive(id);

// Get count
const count = archiveManager.getArchivedCount();

// Clear all
archiveManager.clearArchive();
```

---

## Optimizer Synchronization

### Real-Time Updates with useOptimizerSync

```typescript
const { mutate, context, activeItems } = useOptimizerSync(workspaceId);

// Automatically called in stage callback:
// await mutate(); // Revalidates optimizer context

// Manual refresh:
// await mutate();

// Access optimizer data:
console.log(activeItems); // Currently staged items in Optimizer
```

### Listening for Staging Events

```typescript
useStagingListener(
  workspaceId,
  (item) => {
    // Called when new item is staged in Optimizer
    console.log("Newly staged:", item);
  },
  (item) => {
    // Called when item is archived
    console.log("Newly archived:", item);
  }
);
```

---

## Localization

### Message Retrieval

```typescript
import { getLocaleMessage } from "@/lib/staging/unified-staging-state";

const message = getLocaleMessage(locale, "moved_to_archive");
// AR: "تم النقل إلى السجل"
// EN: "Moved to optimization history"
```

### RTL Layout

```typescript
const isRtl = ["ar", "he", "fa", "ur"].includes(locale);

<div dir={isRtl ? "rtl" : "ltr"}>
  {/* Content automatically respects RTL */}
</div>

// For flex layouts:
className={cn("flex gap-2", isRtl && "flex-row-reverse")}
```

---

## Testing & Validation

### Unit Tests

```typescript
describe("UnifiedStageButton", () => {
  it("moves item to archive on successful stage", async () => {
    const onArchiveItem = jest.fn();
    const { getByRole } = render(
      <UnifiedStageButton
        {...props}
        onArchiveItem={onArchiveItem}
      />
    );

    const button = getByRole("button");
    await userEvent.click(button);

    // Wait for API call
    await waitFor(() => expect(onArchiveItem).toHaveBeenCalled());
  });

  it("syncs optimizer after staging", async () => {
    const mutate = jest.fn();
    const { getByRole } = render(
      <UnifiedStageButton
        {...props}
        optimizerMutate={mutate}
        syncOptimizer={true}
      />
    );

    const button = getByRole("button");
    await userEvent.click(button);

    await waitFor(() => expect(mutate).toHaveBeenCalled());
  });
});
```

### E2E Tests

```typescript
describe("Staging Vault - Full Flow", () => {
  it("stages keyword and syncs optimizer", async () => {
    // 1. Navigate to Keyword Tracker
    // 2. Click Stage button on AI suggestion
    // 3. Verify item moved to archive
    // 4. Verify Optimizer shows new item in Active Context
    // 5. Navigate to Optimizer
    // 6. Verify item appears in active list
  });
});
```

---

## Implementation Checklist

- [ ] Create `lib/staging/unified-staging-state.ts`
- [ ] Create `components/staging/UnifiedStageButton.tsx`
- [ ] Create `lib/staging/module-implementations.ts`
- [ ] Create `hooks/useOptimizerSync.ts`
- [ ] Integrate Reviews module
- [ ] Integrate Competitor Spy module
- [ ] Integrate Market Intel module
- [ ] Integrate Keyword Tracker module
- [ ] Integrate Alerts module
- [ ] Test auto-archive functionality
- [ ] Test Optimizer synchronization
- [ ] Test RTL/LTR layouts
- [ ] Test error handling
- [ ] Test with Arabic locale
- [ ] Performance testing with 100+ items
- [ ] Monitor API call timing
- [ ] Setup monitoring & logging

---

## Troubleshooting

### Issue: Archive doesn't update immediately

**Solution:** Ensure `onArchiveItem` callback is being executed. Check that the state setter is not being batched.

```typescript
// In state manager:
setArchivedItems([...archivedItems, item]);
// Should trigger re-render immediately
```

### Issue: Optimizer doesn't sync

**Solution:** Verify SWR mutation is being called and the API endpoint responds correctly.

```typescript
const { mutate, error } = useOptimizerSync(workspaceId);

if (error) {
  console.error("Optimizer sync error:", error);
}
```

### Issue: RTL layout broken

**Solution:** Ensure `dir` attribute is set on parent and flex-row-reverse is applied.

```typescript
<div dir={isRtl ? "rtl" : "ltr"}>
  <div className={cn("flex gap-2", isRtl && "flex-row-reverse")}>
```

---

## Future Enhancements

1. **Batch Staging:** Stage multiple items at once
2. **Undo Window:** 10-second undo after staging
3. **Staging Preview:** Show what will be sent before confirming
4. **Analytics:** Track staging patterns and user behavior
5. **Webhook Integration:** Notify external systems on staging
6. **Bulk Archive Actions:** Clear all, restore all
7. **Archive Filters:** Filter by date, type, severity
8. **Staging History Graph:** Visual timeline of staged items

---

**Last Updated:** 2026-06-04  
**Status:** Complete and ready for implementation
