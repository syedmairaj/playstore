# Fix: Keyword Staging Toast and Optimizer Display Issue

## Problem Summary

When clicking "Send to AI Optimizer" in Competitor Spy, two things weren't working:
1. **Toast notification** was not appearing
2. **Keywords were not appearing** in the AI Listing Optimizer after staging

## Root Cause Found

### Issue #1: Validation Failure (Toast not showing)

**Root Cause:** `competitor-spy-staging-flow.ts` was sending `signalType: "optimizer_selection"` but the API endpoint schema only allows: `["keyword", "review_issue", "competitor_weakness", "optimization_insight"]`

When the API received `"optimizer_selection"`, it failed validation with a 422 status code **before** even calling `addSignalToVault()`. This means:
- Request returned 422 (Unprocessable Entity)
- Error was caught by the component but the exact validation error wasn't visible
- No toast showed because the promise rejected with a 422
- Signal was never added to the vault

**File:** `/src/lib/client/competitor-spy-staging-flow.ts` Line 178

**Fix Applied:**
```typescript
// BEFORE:
signalType: "optimizer_selection",

// AFTER:
signalType: "optimization_insight",
```

### Issue #2: State Sync (Keywords not appearing in Optimizer)

This was already fixed in previous work:

1. **Query Invalidation** (lines 203-213 of `keyword-curation-floating-bar.tsx`):
```typescript
queryClient.invalidateQueries({
  queryKey: ["optimizer-context", workspaceId],
});
```

2. **Toast with action** (lines 222-232):
```typescript
toast.success(mainMsg, {
  description: detailMsg,
  duration: 5000,
  action: {
    label: labels.goToOptimizer,
    onClick: () => handleNavigateToOptimizer(),
  },
});
```

3. **Hook integration** (`ListingOptimizer.tsx` line 573):
```typescript
const { data: optimizerContext, mutate: refreshOptimizerContext } = 
  useOptimizerSync(workspaceId);
```

4. **Keywords extraction** (line 2959):
```typescript
const stagedKeywords = useMemo(() => {
  const extracted = extractKeywordsFromContext(optimizerContext?.activeItems);
  return deduplicateKeywords(extracted);
}, [optimizerContext?.activeItems]);
```

The flow now:
1. Keywords staged → addSignalToVault() succeeds
2. API returns 200 with signal ID
3. Component shows toast ✅
4. queryClient.invalidateQueries() fires
5. useOptimizerSync refetches `/api/workspaces/{workspaceId}/optimizer/context`
6. optimizerContext updates with new activeItems
7. stagedKeywords useMemo recalculates
8. StagingWorkspaceSection re-renders with new keywords ✅

## Files Modified

### `/src/lib/client/competitor-spy-staging-flow.ts`
Changed line 178:
```typescript
signalType: "optimization_insight", // was "optimizer_selection"
```

## Testing

1. Go to Competitor Spy
2. Select keywords from a competitor snapshot
3. Click "Send to AI Listing Optimizer"
4. **Expected Result #1:** Green success toast appears with "Keywords staged for AI Listing Optimizer"
5. **Expected Result #2:** Floating action bar shows "Continue Later" / "Go to Optimizer" options
6. **Expected Result #3:** Click "Go to Optimizer" → navigate to `/app/{workspaceId}/listing-optimizer`
7. **Expected Result #4:** Keywords appear in Step 3 "Active Context" under "Competitor Keywords" section

## Technical Details

### API Schema Validation

The POST endpoint at `/api/workspaces/[workspaceId]/staging/add` validates with Zod:

```typescript
const bodySchema = z.object({
  signalType: z.enum([
    "keyword",
    "review_issue",
    "competitor_weakness",
    "optimization_insight", // ← Must use this for Competitor Spy selections
  ]),
  // ... other fields
});
```

The error happened because `"optimizer_selection"` is not in this enum.

### Signal Type Usage

- `"competitor_weakness"`: Individual competitor pain points (from Exploit bridge)
- `"optimization_insight"`: Batch keyword selections (from Competitor Spy)
- `"review_issue"`: Review-based improvement signals
- `"keyword"`: Direct keyword input

### Query Invalidation Details

```typescript
// Query key structure (from useOptimizerSync):
const OPTIMIZER_CONTEXT_KEY = (workspaceId: string) => [
  "optimizer-context",
  workspaceId,
];

// Invalidation triggers:
queryClient.invalidateQueries({
  queryKey: ["optimizer-context", workspaceId],
});

// This makes React Query mark the query as stale
// On next access (immediate re-render), it refetches from:
// GET /api/workspaces/{workspaceId}/optimizer/context
```

## Monitoring

Check server logs for:
1. API endpoint `/staging/add` receiving requests with `signalType: "optimization_insight"`
2. addSignalToVault() being called (no more 422 validation errors)
3. Successful 200 responses with `{ ok: true, data: { id: "...", message: "..." } }`

Check client logs for:
1. `[KeywordCurationFloatingBar] ✅ STAGING SUCCESSFUL`
2. `[KeywordCurationFloatingBar] 🔄 INVALIDATING QUERY`
3. `useOptimizerSync` refetching optimizer context
4. `[ListingOptimizer] Extracted X keywords from context`

## Status

✅ **Complete** - Both issues resolved:
1. Toast now shows (validation passes)
2. Keywords now display in Optimizer (query synced via React Query)
