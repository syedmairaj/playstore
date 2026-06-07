# Staging Vault Integration Guide

**Status:** ✅ Complete - Ready to Integrate  
**Files Created:** 4  
**Breaking Changes:** None  
**Database Changes:** None

---

## Overview

The Staging Vault system provides a unified interface for all modules (Common Issues, Competitor Spy, Keywords, Market Intel) to stage, retrieve, and synchronize signals with the AI Listing Optimizer.

**Key Components:**
1. **stageSignal.ts** - Universal backend function for staging signals
2. **frontend-helpers.ts** - Mapper functions for each module
3. **useOptimizerSync.ts** - React hook for real-time synchronization
4. **SignalCard.tsx** - Component for displaying signals

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Components                      │
│  (CommonIssuesPanel, CompetitorSpyPanel, KeywordTracker)    │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│            Signal Mapper Functions (frontend-helpers)        │
│  mapReviewIssueToSignal, mapCompetitorWeaknessToSignal...   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│         stageSignal() - Universal Backend Function          │
│  Validation, RTL detection, metadata enforcement, DB insert │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│         workspace_staging_vault - Database Table            │
│  All signals unified, indexed by source_context_id          │
└─────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│    useOptimizerSync() - Real-time React Hook                │
│  Fetch, filter, group signals by source_context             │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  AI Listing Optimizer (Filtering & Recommendation Engine)   │
│  Consumes signals grouped by source_context                 │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
lib/staging-vault/
├── stageSignal.ts              ✅ Core backend function
├── frontend-helpers.ts          ✅ Module-specific mappers
└── useOptimizerSync.ts          ✅ React hook + helpers

components/staging-vault/
└── SignalCard.tsx               ✅ Display component

(root)
└── STAGING_VAULT_INTEGRATION_GUIDE.md  ✅ This file
```

---

## Integration Steps

### Step 1: Import Mappers in Your Module Components

#### Common Issues Module

```typescript
// components/modules/CommonIssuesPanel.tsx

import { mapReviewIssueToSignal } from "@/lib/staging-vault/frontend-helpers";
import { stageSignal } from "@/lib/staging-vault/stageSignal";
import { useSupabaseClient } from "@supabase/auth-helpers-react";

export function CommonIssuesPanel() {
  const supabase = useSupabaseClient();
  const [issues, setIssues] = useState([]);

  const handleStageIssue = async (issue) => {
    try {
      // Step 1: Map issue to signal format
      const signalRequest = mapReviewIssueToSignal({
        issueId: issue.id,
        issue: {
          title: issue.title,
          description: issue.description,
          severity: issue.severity,
          impactPercent: issue.impactPercent,
          topQuote: issue.topQuote,
          language: "en", // or detect from context
        },
        workspaceId: workspaceId,
        appId: appId,
      });

      // Step 2: Send to backend
      const response = await stageSignal(supabase, signalRequest);
      console.log("Signal staged:", response);

      // Step 3: Refetch signals in optimizer
      // (handled automatically by useOptimizerSync hook)
    } catch (error) {
      console.error("Failed to stage signal:", error);
    }
  };

  return (
    <div>
      {issues.map((issue) => (
        <button
          key={issue.id}
          onClick={() => handleStageIssue(issue)}
        >
          Stage: {issue.title}
        </button>
      ))}
    </div>
  );
}
```

#### Competitor Spy Module

```typescript
// components/modules/CompetitorSpyPanel.tsx

import {
  mapCompetitorWeaknessToSignal,
  mapCompetitorSentimentToSignal,
} from "@/lib/staging-vault/frontend-helpers";
import { stageSignal } from "@/lib/staging-vault/stageSignal";

export function CompetitorSpyPanel() {
  const supabase = useSupabaseClient();

  const handleStageWeakness = async (weakness) => {
    const signalRequest = mapCompetitorWeaknessToSignal({
      weaknessId: weakness.id,
      weakness: {
        title: weakness.title,
        description: weakness.description,
        competitorName: weakness.competitorName,
        competitorPackage: weakness.competitorPackage,
        severity: weakness.severity,
        language: "en",
      },
      workspaceId: workspaceId,
    });

    await stageSignal(supabase, signalRequest);
  };

  return (
    // ... UI code ...
  );
}
```

#### Keywords Module

```typescript
// components/modules/KeywordTracker.tsx

import {
  mapKeywordSpotlightToSignal,
  mapKeywordTrackerAlertToSignal,
} from "@/lib/staging-vault/frontend-helpers";
import { stageSignal } from "@/lib/staging-vault/stageSignal";

export function KeywordTracker() {
  const supabase = useSupabaseClient();

  const handleStageKeyword = async (keyword) => {
    const signalRequest = mapKeywordSpotlightToSignal({
      keywordId: keyword.id,
      keyword: {
        keyword: keyword.text,
        searchVolume: keyword.volume,
        difficulty: keyword.difficulty,
        category: keyword.category,
        language: keyword.language || "en",
      },
      workspaceId: workspaceId,
    });

    await stageSignal(supabase, signalRequest);
  };

  return (
    // ... UI code ...
  );
}
```

### Step 2: Integrate Hook in Optimizer Component

```typescript
// components/modules/AIListingOptimizer.tsx

import { useOptimizerSync } from "@/lib/staging-vault/useOptimizerSync";
import { SignalCard } from "@/components/staging-vault/SignalCard";
import { useSupabaseClient } from "@supabase/auth-helpers-react";

export function AIListingOptimizer({ workspaceId }) {
  const supabase = useSupabaseClient();

  // Fetch signals in real-time with auto-refresh
  const {
    signals,
    isLoading,
    error,
    signalsByContext,
    refetch,
  } = useOptimizerSync(workspaceId, {
    supabase,
    realtime: true,
    pollingInterval: 10000, // Poll every 10s as fallback
    autoFetch: true,
  });

  return (
    <div className="space-y-6">
      {/* Common Issues Section */}
      <section>
        <h2>Issues to Address</h2>
        {signalsByContext.common_issues_theme.map((signal) => (
          <SignalCard
            key={signal.id}
            signal={signal}
            onAction={(action, signal) => {
              console.log(`${action} signal:`, signal);
              // Apply optimization based on signal
            }}
          />
        ))}
      </section>

      {/* Competitor Weaknesses Section */}
      <section>
        <h2>Competitor Opportunities</h2>
        {signalsByContext.competitor_weakness.map((signal) => (
          <SignalCard key={signal.id} signal={signal} />
        ))}
      </section>

      {/* Keyword Opportunities Section */}
      <section>
        <h2>Keyword Opportunities</h2>
        {signalsByContext.keyword_spotlight.map((signal) => (
          <SignalCard key={signal.id} signal={signal} />
        ))}
      </section>

      {/* Manual Signals Section */}
      <section>
        <h2>Manual Notes</h2>
        {signalsByContext.manual.map((signal) => (
          <SignalCard key={signal.id} signal={signal} compact />
        ))}
      </section>

      {/* Refresh Button */}
      <button
        onClick={() => refetch()}
        disabled={isLoading}
      >
        {isLoading ? "Refreshing..." : "Refresh Signals"}
      </button>

      {error && (
        <div className="text-red-600">
          Error: {error.message}
        </div>
      )}
    </div>
  );
}
```

### Step 3: Use Simple Filter Hooks

```typescript
// components/modules/CommonIssuesPanel.tsx

import {
  useSignalsByContext,
  useSignalCounts,
} from "@/lib/staging-vault/useOptimizerSync";

export function CommonIssuesPanel({ workspaceId }) {
  const supabase = useSupabaseClient();

  // Get only common issues signals
  const { signals: commonIssues, signalCount } = useSignalsByContext(
    workspaceId,
    "common_issues_theme",
    supabase
  );

  // Get signal counts per context
  const counts = useSignalCounts(workspaceId, supabase);

  return (
    <div>
      <h2>Common Issues ({signalCount})</h2>
      {commonIssues.map((signal) => (
        <SignalCard key={signal.id} signal={signal} />
      ))}

      {/* Show other module counts */}
      <div className="stats">
        <div>Competitor Weaknesses: {counts.competitor_weakness}</div>
        <div>Keywords: {counts.keyword_spotlight}</div>
        <div>Market Opportunities: {counts.market_opportunity}</div>
      </div>
    </div>
  );
}
```

---

## Data Flow Example: Complete Workflow

### Scenario: User Stages a Review Issue

```typescript
// 1. User clicks "Stage Issue" in Common Issues panel
const issue = {
  id: "issue-123",
  title: "App Crashes on Startup",
  description: "Users report app crashes when launching",
  severity: "critical",
  impactPercent: 45,
  topQuote: "The app won't open at all",
};

// 2. Map to signal format
const signalRequest = mapReviewIssueToSignal({
  issueId: issue.id,
  issue: {
    title: issue.title,
    description: issue.description,
    severity: issue.severity,
    impactPercent: issue.impactPercent,
    topQuote: issue.topQuote,
    language: "en",
  },
  workspaceId: "ws-123",
  appId: "app-456",
});

// 3. signalRequest structure:
{
  workspace_id: "ws-123",
  signal_type: "review_issue",
  source: "review_analysis",
  source_context: "common_issues_theme",
  source_context_id: "issue-123",  // ← Traceable back to issue
  content: "App Crashes on Startup",
  language: "en",
  source_app_id: "app-456",
  metadata: {
    severity: "critical",
    impactPercent: 45,
    description: "Users report app crashes when launching",
    topQuote: "The app won't open at all",
  }
}

// 4. Send to backend
const response = await stageSignal(supabase, signalRequest);

// 5. Backend validates:
// ✅ source_context_id is non-empty (source_context_id: "issue-123")
// ✅ language is valid (en)
// ✅ is_rtl calculated (false for "en")
// ✅ severity is in enum ["critical", "high", "medium", "low"]
// ✅ impactPercent is 0-100 (45)

// 6. Signal inserted into workspace_staging_vault:
{
  id: "sig-789",
  workspace_id: "ws-123",
  signal_type: "review_issue",
  source: "review_analysis",
  source_context: "common_issues_theme",
  source_context_id: "issue-123",  // ← Grouped by context for AI
  content: "App Crashes on Startup",
  language: "en",
  is_rtl: false,
  metadata: { ... },
  created_at: "2026-06-05T10:30:00Z",
}

// 7. Real-time subscription detects insert
// useOptimizerSync hook is notified via Supabase Realtime

// 8. Hook updates UI:
// signalsByContext.common_issues_theme now includes this signal

// 9. AI Listing Optimizer component re-renders:
// Shows new "App Crashes on Startup" signal in Common Issues section
```

---

## Language & RTL Support

All signals automatically handle language-specific rendering:

```typescript
// English signal
{
  language: "en",
  is_rtl: false,
  content: "App Crashes on Startup"
}

// Arabic signal
{
  language: "ar",
  is_rtl: true,
  content: "التطبيق ينهار عند بدء التشغيل"
}
```

**Component automatically renders with correct direction:**
```tsx
<div dir={signal.is_rtl ? "rtl" : "ltr"}>
  {signal.content}
</div>
```

---

## Validation Rules

### Content
- Non-empty string
- Max 5000 characters

### Language
- Format: `^[a-z]{2}(-[A-Z]{2})?$` (e.g., "en", "ar", "en-US", "ar-SA")
- RTL auto-detected: ar, he, fa, ur

### Source Context
- Must be one of 8 values:
  - `common_issues_theme` (Common Issues)
  - `competitor_weakness` (Competitor Spy)
  - `competitor_sentiment` (Sentiment analysis)
  - `keyword_spotlight` (Market > Keywords)
  - `keyword_tracker_alert` (Keyword Tracker)
  - `market_opportunity` (Market Intel)
  - `listing_analysis` (Listing optimization)
  - `manual` (User-created)

### Source Context ID
- Non-empty string
- Unique identifier linking to source module (issue_id, keyword_id, etc.)
- **Critical for AI Optimizer filtering**

### Metadata
- Optional JSON object
- `severity`: enum ["critical", "high", "medium", "low"]
- `impactPercent`: number 0-100
- `description`, `topQuote`, `searchVolume`, etc.: optional strings/numbers

---

## Error Handling

```typescript
try {
  const response = await stageSignal(supabase, signalRequest);
  console.log("Success:", response);
} catch (error) {
  // Error messages are descriptive
  if (error.message.includes("source_context_id is required")) {
    // Handle missing context binding
  } else if (error.message.includes("Invalid severity")) {
    // Handle metadata validation
  } else if (error.message.includes("User not authenticated")) {
    // Handle auth error
  } else {
    // Handle generic error
  }
}
```

---

## Performance Considerations

### Caching
```typescript
// Signals are cached for 5 seconds by default
const { signals } = useOptimizerSync(workspaceId, {
  supabase,
  cacheDuration: 5000,  // Adjust as needed
});
```

### Real-time vs Polling
```typescript
// Option 1: Real-time (recommended)
const { signals } = useOptimizerSync(workspaceId, {
  supabase,
  realtime: true,  // Enables Supabase subscription
});

// Option 2: Polling
const { signals } = useOptimizerSync(workspaceId, {
  supabase,
  pollingInterval: 10000,  // Poll every 10s
});

// Option 3: Manual refresh
const { signals, refetch } = useOptimizerSync(workspaceId, {
  supabase,
  realtime: false,
  pollingInterval: 0,
  autoFetch: false,
});

// Refetch on demand
await refetch();
```

---

## Testing Checklist

- [ ] Stage signal from Common Issues module
- [ ] Verify signal appears in AI Listing Optimizer
- [ ] Test English signal (LTR)
- [ ] Test Arabic signal (RTL auto-detected)
- [ ] Verify severity metadata renders
- [ ] Test competitor weakness mapping
- [ ] Test keyword spotlight mapping
- [ ] Verify real-time sync (subscribe/publish)
- [ ] Test polling fallback
- [ ] Verify cache invalidation
- [ ] Check error messages are descriptive
- [ ] Validate context binding (source_context_id not null)

---

## TypeScript Support

All utilities are fully typed:

```typescript
import type {
  StageSignalRequest,
  StageSignalResponse,
  SourceContext,
  SignalType,
  SignalSource,
  StagedSignal,
} from "@/lib/staging-vault/stageSignal";

import type { UseOptimizerSyncState, UseOptimizerSyncOptions } from "@/lib/staging-vault/useOptimizerSync";

// All functions have full IntelliSense
const request: StageSignalRequest = {
  workspace_id: "ws-123",
  signal_type: "review_issue",  // ← TypeScript autocomplete
  source: "review_analysis",     // ← TypeScript autocomplete
  source_context: "common_issues_theme",  // ← TypeScript autocomplete
  // ...
};
```

---

## API Reference

### Backend Functions

#### `stageSignal(supabase, request)`
```typescript
await stageSignal(supabase, {
  workspace_id: "ws-123",
  signal_type: "review_issue",
  source: "review_analysis",
  source_context: "common_issues_theme",
  source_context_id: "issue-123",
  content: "App crashes",
  language: "en",
  metadata: { severity: "critical", impactPercent: 45 }
});
```

### Frontend Mappers

#### `mapReviewIssueToSignal(params)`
#### `mapCompetitorWeaknessToSignal(params)`
#### `mapCompetitorSentimentToSignal(params)`
#### `mapKeywordSpotlightToSignal(params)`
#### `mapKeywordTrackerAlertToSignal(params)`
#### `mapMarketOpportunityToSignal(params)`
#### `batchMapSignals(signals, mapperFunction)`
#### `validateSignalRequest(request)`

### React Hooks

#### `useOptimizerSync(workspaceId, options?)`
Main hook for fetching and syncing signals.

#### `useSignalsByContext(workspaceId, sourceContext, supabase?)`
Filtered hook for single context.

#### `useSignalCounts(workspaceId, supabase?)`
Get count of signals per context.

---

## Next Steps

1. ✅ Copy all 4 files to your project
2. ✅ Update imports in your module components
3. ✅ Call mapper functions when staging signals
4. ✅ Integrate `useOptimizerSync` in Optimizer component
5. ✅ Test end-to-end with all 5 modules
6. ✅ Verify RTL/LTR rendering with English and Arabic
7. ✅ Monitor real-time sync with Supabase dashboard

---

**Status:** Ready for integration  
**Estimated Effort:** 4-6 hours per module  
**Risk Level:** Low (no breaking changes)  
**Benefit:** Unified signal management across all modules

**Ready to integrate? Start with Common Issues module! 🚀**
