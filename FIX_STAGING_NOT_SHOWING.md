# Fix: Staged Issues Not Appearing in Active Context

**Problem:** You stage an issue from Reviews > Common Issues, but it doesn't appear in the AI Listing Optimizer's "Active Context" area.

**Root Cause:** After staging, the optimizer context is not being refreshed. The `IssueCard` component calls `StageButton` but doesn't provide an `onStaged` callback.

---

## Quick Fix (2 Steps)

### Step 1: Update `IssueCard.tsx`

In `/components/reviews/IssueCard.tsx`, modify the component to accept a callback and pass it to StageButton:

```typescript
// BEFORE (line 47-51)
export type IssueCardProps = {
  issue:       IssueItem;
  workspaceId: string;
  appId?:      string;
};

// AFTER (add the callback)
export type IssueCardProps = {
  issue:       IssueItem;
  workspaceId: string;
  appId?:      string;
  onStaged?:   () => void;  // ← ADD THIS
};

// BEFORE (line 57)
export function IssueCard({ issue, workspaceId, appId }: IssueCardProps) {

// AFTER
export function IssueCard({ issue, workspaceId, appId, onStaged }: IssueCardProps) {
  // ↑ Add onStaged to destructuring

// BEFORE (line 113-129, the StageButton)
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
  className="mt-1 w-full sm:w-auto"
/>

// AFTER (add onStaged callback)
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
  className="mt-1 w-full sm:w-auto"
  onStaged={onStaged}  // ← ADD THIS
/>
```

### Step 2: Update ReviewsClient.tsx

In `/components/reviews/ReviewsClient.tsx`, find where `IssueCard` is rendered and add the callback:

```typescript
// Add import at the top
import { useOptimizerSync } from "@/hooks/useOptimizerSync";

// Inside the ReviewsClient component, add this:
const { mutate: refreshOptimizerContext } = useOptimizerSync(workspaceId);

// Find the IssueCard rendering (around line 639)
// BEFORE
<IssueCard
  issue={issue}
  workspaceId={workspaceId}
  appId={selectedApp?.id}
/>

// AFTER
<IssueCard
  issue={issue}
  workspaceId={workspaceId}
  appId={selectedApp?.id}
  onStaged={refreshOptimizerContext}  // ← ADD THIS
/>
```

---

## Verification

After applying the fix:

1. Open Reviews page
2. Click "Stage Issue" button on a Common Issue
3. ✅ Toast should say "Successfully Staged"
4. Open AI Listing Optimizer in a new tab/window (or switch to it)
5. ✅ The staged issue should appear in "Active Context - Review Issues" section
6. ✅ The count badge should increase

---

## What This Does

- `useOptimizerSync()` hook fetches the optimizer context from `/api/workspaces/[workspaceId]/optimizer/context`
- When you click "Stage Issue", it calls the backend
- Then the callback `onStaged` is triggered
- Which calls `refreshOptimizerContext()` (the `mutate` function from the hook)
- Which refetches the optimizer context
- Which triggers a re-render in the Optimizer showing the new staged signal

---

## Why This Happened

The infrastructure was built correctly:
- ✅ `/api/workspaces/[workspaceId]/staging/add` endpoint works
- ✅ `/api/workspaces/[workspaceId]/optimizer/context` endpoint works
- ✅ `useOptimizerSync` hook exists
- ✅ `StageButton` component works

But the **wiring between Reviews and Optimizer** was missing. The staging happened, but nothing told the Optimizer to fetch the new data.

---

## Done!

That's it. Two simple changes = signals appear immediately after staging.

Test it now and let me know if it works!
