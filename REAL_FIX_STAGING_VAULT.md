# REAL FIX: Integrate Staging Vault into AI Listing Optimizer

## The Actual Problem

The staging vault infrastructure **exists** and **works**, but the **ListingOptimizer component is not connected to it**.

**Current flow:**
- You stage an issue ✅ (gets saved to `workspace_staging_vault`)
- The staging endpoint works ✅ (`/api/workspaces/[workspaceId]/staging/add`)
- The optimizer context endpoint works ✅ (`/api/workspaces/[workspaceId]/optimizer/context`)
- **BUT** the ListingOptimizer component doesn't use either of these ❌

**What happens:**
- ListingOptimizer only shows `queuedImprovements` (from `workspace_listing_backlog` table)
- It completely ignores the staging vault data
- So staged signals never appear in "Active Context"

---

## The Fix

You need to **integrate the staging vault data into ListingOptimizer.tsx**.

### Step 1: Add the hook to ListingOptimizer.tsx

At the top of `components/ListingOptimizer.tsx`, add this import:

```typescript
// Add with other imports
import { useOptimizerSync } from "@/hooks/useOptimizerSync";
```

### Step 2: Call the hook inside the component

Inside the main `ListingOptimizer` function, add this right after other `useState`/`useQuery` hooks:

```typescript
// Fetch staging vault context
const { data: optimizerContext, mutate: refreshOptimizerContext } = useOptimizerSync(workspaceId);
```

### Step 3: Combine staging vault data with existing queue

Find the section where `queuedImprovements` is used for the "REVIEW ISSUES" section (around line 3240).

**BEFORE (current):**
```typescript
// Only showing queuedImprovements
const reviewQueuePills = queuedImprovements
  .filter((item) => item.type === "issue")
  .slice(0, 12);

// ... later in render ...
{reviewQueuePills.length > 0 ? (
  // show pills
) : (
  <p>None staged — visit Reviews to add signals</p>
)}
```

**AFTER (combined with staging vault):**
```typescript
// Combine queued improvements AND staging vault review issues
const reviewQueuePills = [
  // From listing backlog (existing)
  ...queuedImprovements
    .filter((item) => item.type === "issue")
    .map((item) => ({
      id: item.id,
      label: item.title,
      source: "backlog",
    }))
    .slice(0, 12),
  
  // From staging vault (NEW)
  ...(optimizerContext?.activeItems || [])
    .filter((item) => item.signalType === "review_issue")
    .map((item) => ({
      id: item.id,
      label: item.content,
      source: "staging_vault",
      metadata: item.metadata,
    }))
    .slice(0, 12),
].slice(0, 12); // Cap at 12 total

// ... later in render - handle both sources ...
{reviewQueuePills.length > 0 ? (
  <div className="flex flex-wrap gap-1.5">
    <AnimatePresence initial={false}>
      {reviewQueuePills.map((item) => {
        const label = item.label;
        return (
          <motion.span
            key={`${item.source}-${item.id}`}
            layout
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.18 }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-200/90",
              loading && "pointer-events-none opacity-60",
            )}
          >
            <AlertTriangle className="size-2.5 shrink-0 text-rose-400/70" aria-hidden />
            <span className="max-w-[160px] truncate">{label}</span>
            {!loading ? (
              <button
                type="button"
                aria-label={`Remove ${label}`}
                onClick={() => {
                  if (item.source === "staging_vault") {
                    // Delete from staging vault
                    handleRemoveFromStagingVault(item.id);
                  } else {
                    // Delete from backlog
                    handleRemoveQueueItem(item.id);
                  }
                }}
                className="ms-0.5 rounded-full p-0.5 text-rose-400/50 transition hover:bg-rose-500/20 hover:text-rose-300"
              >
                ×
              </button>
            ) : null}
          </motion.span>
        );
      })}
    </AnimatePresence>
  </div>
) : (
  <p className="text-[11px] italic text-white/25">
    {isRtl ? "لا توجد مشكلات مراجعات — اذهب إلى المراجعات لإضافة الإشارات" : "None staged — visit Reviews to add signals"}
  </p>
)}
```

### Step 4: Do the same for other signal types

Repeat Step 3 for:
- **MARKET OPPORTUNITIES** - Filter by `signalType === "keyword"` or `"optimization_insight"`
- **COMPETITOR WEAKNESSES** - Filter by `signalType === "competitor_weakness"`

---

## Optional: Add Delete from Staging Vault

If you want to support removing signals from the staging vault UI, add this function:

```typescript
async function handleRemoveFromStagingVault(signalId: string) {
  try {
    const response = await fetch(
      `/api/workspaces/${workspaceId}/staging/delete`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId }),
      }
    );

    if (response.ok) {
      // Refresh the optimizer context
      refreshOptimizerContext();
      showToast({
        type: "success",
        message: "Signal removed from vault",
      });
    }
  } catch (error) {
    console.error("Failed to remove signal:", error);
  }
}
```

---

## What This Does

1. **Fetches staging vault** data on component mount via `useOptimizerSync()`
2. **Combines** staging vault signals with existing queued improvements
3. **Displays them** all in the "Active Context" section
4. **Allows removal** of both backlog items AND staging vault signals
5. **Auto-refreshes** when new signals are staged

---

## Why This Wasn't Done Before

The infrastructure was built correctly, but the integration was incomplete:
- ✅ Staging backend works
- ✅ Optimizer context endpoint works
- ✅ useOptimizerSync hook exists
- ❌ ListingOptimizer doesn't USE the hook

It's like building a restaurant with a kitchen and a dining room, but not connecting them. The food gets cooked, but diners never see it.

---

## Test It

After making these changes:

1. Open Reviews → Common Issues
2. Click "Stage Issue" on any issue
3. Switch to "AI Listing Optimizer"
4. **Look for the issue under "REVIEW ISSUES"** in the "ACTIVE CONTEXT" box
5. ✅ It should appear there now (both staging vault AND backlog items)

---

## Files to Modify

1. **`components/ListingOptimizer.tsx`** - Add hook, combine data, render both sources
2. **Optional: `app/api/workspaces/[workspaceId]/staging/delete/route.ts`** - If you want delete support

That's it. This is the real fix that connects everything together.
