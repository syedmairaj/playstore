# Reviews Module - Complete Staging Implementation Plan

**Status:** Ready for Implementation  
**Date:** 2026-06-04  
**Scope:** Reviews → Active Insights + Optimization History Archive + AI Listing Optimizer  

---

## Current Structure (From Code Analysis)

### ReviewsClient.tsx - Two Tabs System

**Tab 1: Active Insights**
- CommonIssuesPanel → Shows Gemini analysis issues from reviews
- IssueCard grid → "Stage Issue" button (currently not working)
- Active Optimization Queue → Shows staged issues

**Tab 2: Optimization History Archive**
- doneItems → Shows archived/implemented issues
- With "Restore to Active" button
- Cards show: title, metadata, "Listing Updated" badge, restore/delete buttons

---

## The Problem

When user clicks "Stage Issue" on an IssueCard:
1. ❌ Nothing visible happens in the UI
2. ❌ Issue doesn't move to archive
3. ❌ Optimizer doesn't update with the issue

---

## The Solution: Three-Part Implementation

### PART 1: Update IssueCard Component

**File:** `components/reviews/IssueCard.tsx`

**Current Issue:**
- Uses `StageButton` but it's not connected to parent state management
- No callback to remove from active list
- No integration with archive system

**Required Changes:**

```typescript
type IssueCardProps = {
  issue: IssueItem;
  workspaceId: string;
  appId?: string;
  added?: boolean;  // Already exists
  onAdd?: () => void | Promise<void>;  // Already exists
  
  // NEW PROPS NEEDED:
  onArchiveIssue?: (issueId: string, issue: IssueItem) => Promise<void>;
  isLoading?: boolean;
  isStagedToVault?: boolean;  // True if issue is in staging vault
};

function IssueCard({
  issue,
  workspaceId,
  appId,
  added,
  onAdd,
  onArchiveIssue,  // NEW
  isLoading,  // NEW
  isStagedToVault,  // NEW
}: IssueCardProps) {
  return (
    <Card>
      {/* Existing card content */}
      
      {/* REPLACE the existing button with: */}
      {isStagedToVault ? (
        // Already staged - show "Open in Optimizer" or disabled state
        <button disabled className="...">
          Already Staged ✓
        </button>
      ) : (
        // Not staged - show Stage button
        <button
          onClick={async () => {
            // API call to stage
            await fetch(`/api/workspaces/${workspaceId}/staging/add`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                signalType: "review_issue",
                signalId: issue.title,
                content: issue.title,
                source: "review_analysis",
                sourceAppId: appId,
                metadata: {
                  description: issue.description,
                  severity: issue.severity,
                  impactPercent: issue.impactPercent,
                  quote: issue.topQuote,
                }
              })
            });
            
            // Call parent callback to move to archive
            await onArchiveIssue?.(issue.title, issue);
          }}
          disabled={isLoading || isStagedToVault}
        >
          {isLoading ? "Staging..." : "Stage Issue"}
        </button>
      )}
    </Card>
  );
}
```

---

### PART 2: Update ReviewsClient Component

**File:** `components/reviews/ReviewsClient.tsx`

**Required Changes:**

#### Add New State for Archive

```typescript
// After line ~918 (after insightsTab state)
const [archivedIssues, setArchivedIssues] = useState<Array<{
  issueId: string;
  issue: IssueItem;
  archivedAt: string;
  packageName: string;
  countryCode: string;
}>>([]);
```

#### Add Archive Handler

```typescript
const handleArchiveIssue = useCallback(
  async (issueId: string, issue: IssueItem) => {
    // Add to local archived state immediately (optimistic)
    setArchivedIssues(prev => [...prev, {
      issueId,
      issue,
      archivedAt: new Date().toISOString(),
      packageName: selectedAppFilter?.packageName || "",
      countryCode: selectedAppFilter?.countryCode || "us",
    }]);
    
    // Remove from visible insights by updating excludeTitles
    // This happens automatically through archivedTitles memo

    // Show success toast
    toast.success(`"${issue.title}" moved to Optimization History`);
  },
  [selectedAppFilter]
);
```

#### Update Restore Handler

```typescript
// Modify existing restoreItem function (around line 1170)
const restoreItem = useCallback(async (itemId: string) => {
  // ... existing code ...
  
  // When restoring, also remove from local archivedIssues
  setArchivedIssues(prev => prev.filter(item => item.issueId !== itemId));
  
  // ... rest of function ...
}, [...deps]);
```

#### Update CommonIssuesPanel Call

```typescript
// Around line 1843-1854, update IssueCard rendering:

{visibleInsights.map((issue, idx) => {
  const issueId = `${packageName}:${countryCode}:${idx}`;
  return (
    <IssueCard
      key={issueId}
      issue={issue}
      workspaceId={workspaceId}
      appId={appId}
      added={stagedTitles.has(issue.title)}
      onAdd={() => onAddImprovement(issueId, issue)}
      // ADD THESE NEW PROPS:
      onArchiveIssue={handleArchiveIssue}
      isLoading={false}
      isStagedToVault={archivedIssues.some(a => a.issue.title === issue.title)}
    />
  );
})}
```

#### Update Archive Tab Display

```typescript
// Around line 2022-2040, update the archive grid:

{/* ── Archive Issues Grid ── */}
{!backlogLoading && (archivedIssues.length > 0 || doneItems.length > 0) && (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {/* NEW: Local archived issues from staging */}
    {archivedIssues.map((archived) => (
      <div
        key={archived.issueId}
        className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-4"
      >
        <div className="space-y-3">
          {/* Title */}
          <h3 className="font-medium text-sm text-white">
            {archived.issue.title}
          </h3>
          
          {/* Description */}
          <p className="text-xs text-zinc-400">
            {archived.issue.description}
          </p>
          
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs bg-emerald-500/10 text-emerald-300">
              ✓ Listing Updated
            </span>
            <span className="text-[10px] text-zinc-500">
              Staged {new Date(archived.archivedAt).toLocaleDateString()}
            </span>
          </div>
          
          {/* Restore Button */}
          <button
            onClick={() => {
              handleArchiveIssue(archived.issueId, archived.issue);
              // OR better: call restoreItem with proper item ID
            }}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-blue-500/35 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-300 hover:bg-blue-500/15 transition"
          >
            <ArrowUp className="size-3" />
            Restore to Active
          </button>
          
          {/* Delete Button */}
          <button
            className="w-full p-2 text-red-400 hover:bg-red-500/10 rounded transition"
          >
            <Trash2 className="size-4 mx-auto" />
          </button>
        </div>
      </div>
    ))}
    
    {/* EXISTING: Done items from backlog */}
    {doneItems.map((item) => {
      // ... existing code ...
    })}
  </div>
)}
```

---

### PART 3: Enable Optimizer Sync

**File:** Where Optimizer displays "Active Context"

**Required Integration:**

Add `useOptimizerSync` hook to refresh Optimizer's "Active Context" when:
1. Issue is staged (moved to archive)
2. Issue is restored (moved back to active)

```typescript
// In ReviewsClient.tsx, add:
import { useOptimizerSync } from "@/hooks/useOptimizerSync";

// Inside ReviewsClient component:
const { mutate: mutateOptimizer } = useOptimizerSync(workspaceId);

// Update handleArchiveIssue to trigger sync:
const handleArchiveIssue = useCallback(
  async (issueId: string, issue: IssueItem) => {
    // ... existing archive logic ...
    
    // Sync Optimizer
    await mutateOptimizer();
    
    // ... rest of function ...
  },
  [selectedAppFilter, mutateOptimizer]
);
```

---

## Data Flow Diagram

```
User clicks "Stage Issue" (IssueCard)
    ↓
OnArchiveIssue callback triggered
    ↓
├─ API: POST /api/workspaces/{id}/staging/add
│  └─ Saves issue to workspace_staging_vault table
│
├─ Local State: addToArchivedIssues()
│  └─ Issue removed from Active Insights
│  └─ Issue added to Optimization History Archive
│
├─ Optimizer Sync: mutateOptimizer()
│  └─ Revalidates /api/workspaces/{id}/optimizer/context
│  └─ Optimizer fetches updated "Active Context"
│  └─ Issue appears in Optimizer under "Active Context - Review Issues"
│
└─ UI Update:
   ├─ Active Insights tab: Issue disappears
   ├─ Archive tab: Issue card appears with "Restore to Active" button
   └─ Optimizer: Issue appears in Active Context
```

---

## Implementation Checklist

### IssueCard.tsx
- [ ] Add `onArchiveIssue` prop
- [ ] Add `isLoading` prop
- [ ] Add `isStagedToVault` prop
- [ ] Replace button with conditional "Stage Issue" / "Already Staged"
- [ ] Implement API call to `/api/workspaces/{id}/staging/add`
- [ ] Call `onArchiveIssue` callback on success

### ReviewsClient.tsx
- [ ] Add `archivedIssues` state
- [ ] Implement `handleArchiveIssue` callback
- [ ] Update `CommonIssuesPanel` call with new props
- [ ] Update Archive tab to display `archivedIssues`
- [ ] Add "Restore to Active" button in archive
- [ ] Import and use `useOptimizerSync` hook
- [ ] Trigger `mutateOptimizer()` on archive action
- [ ] Update `restoreItem` to sync optimizer

### Testing
- [ ] Click "Stage Issue" → Issue disappears from Active Insights ✓
- [ ] Click "Stage Issue" → Issue appears in Archive tab ✓
- [ ] Archive shows correct metadata and "Restore" button ✓
- [ ] Click "Restore" → Issue moves back to Active ✓
- [ ] Optimizer syncs and shows issue in Active Context ✓
- [ ] Works in both English and Arabic ✓

---

## Key Points

1. **No Page Refresh** - Optimistic UI update (no waiting for backend)
2. **Two Tabs** - Active Insights vs Optimization History Archive
3. **Archive Card** - Same metadata as active, but with "Restore" button
4. **Optimizer Sync** - Real-time update of Active Context
5. **State Management** - Local `archivedIssues` state + parent callback

---

## Files to Modify

1. `components/reviews/IssueCard.tsx` - Add props and archive logic
2. `components/reviews/ReviewsClient.tsx` - Add state, handlers, UI updates

**Total Changes:** ~200 lines of code  
**Complexity:** Medium (state management + callbacks)  
**Impact:** Complete working staging flow for Reviews module

---

**Status:** Ready to implement  
**Next Step:** Start with IssueCard.tsx modifications
