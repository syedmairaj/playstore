# CRITICAL FIX: Keywords Not Appearing in Active Context

## Problem

When clicking "Send to AI Optimizer" in Competitor Spy:
1. ❌ No toast message appears
2. ❌ Keywords don't show in AI Listing Optimizer's "Active Context" section under "Competitor Keywords"

## Root Cause Analysis

### Issue #1: API Validation Failed (No Toast)

**Root Cause:** `signalType: "optimizer_selection"` was not in API schema enum

**Fixed by:** Changing to `signalType: "optimization_insight"` (which IS in the schema)

**File:** `/src/lib/client/competitor-spy-staging-flow.ts` Line 178

---

### Issue #2: Keywords Not Extracted (No Display) ⚠️ CRITICAL

**Root Cause:** Keywords were stored in WRONG location in metadata

**The Bug:**
```typescript
// WRONG - keywords at top level:
const result = await addSignalToVault(supabase, workspaceId, {
  signalType: "optimization_insight",
  metadata: {
    competitor_id: competitorId,
    // ... other fields
  },
  keywords: selectedKeywords,  // ← WRONG PLACE - top level!
});
```

**Why It Failed:**
1. Signal stored to database with `metadata: { ... }` and `keywords: [...]` at top level
2. When optimizerContext fetches activeItems, it has structure:
   ```typescript
   {
     id: "signal-id",
     metadata: { competitor_id: "...", ... },  // keywords NOT here!
     keywords: [...],  // Unreachable by extraction function
   }
   ```
3. `extractKeywordsFromContext()` looks for `metadata.keywords`:
   ```typescript
   const metadata = item.metadata as Record<string, unknown>;
   if (metadata?.keywords && Array.isArray(metadata.keywords)) {
     // Extract keywords...
   }
   ```
4. It finds nothing because `keywords` is at `item.keywords`, not `item.metadata.keywords`
5. Result: Empty array, no keywords displayed ❌

**The Fix:**
```typescript
// CORRECT - keywords inside metadata:
const result = await addSignalToVault(supabase, workspaceId, {
  signalType: "optimization_insight",
  metadata: {
    competitor_id: competitorId,
    competitor_name: competitorName,
    selected_keywords_count: selectedKeywords.length,
    selected_at: timestamp,
    app_id: appId,
    locale: locale,
    keywords: selectedKeywords,  // ← CORRECT - inside metadata!
  },
  // No top-level keywords field
});
```

**File:** `/src/lib/client/competitor-spy-staging-flow.ts` Lines 177-193

---

## Data Flow (Correct Path)

```
1. User selects keywords in Competitor Spy
   ↓
2. Click "Send to AI Optimizer"
   ↓
3. addSignalToVault() stores:
   {
     workspace_id: "ws-123",
     signal_type: "optimization_insight",
     content: "Competitor Spy keyword selection...",
     language: "en",
     metadata: {
       competitor_id: "comp-456",
       competitor_name: "MyFitnessPal",
       keywords: [
         { term: "diet app", category: "high_volume" },
         { term: "calorie tracker", category: "high_volume" },
         { term: "fitness planning", category: "intent_based" }
       ]
     }
   }
   ↓
4. Query invalidation fires:
   queryClient.invalidateQueries({
     queryKey: ["optimizer-context", workspaceId],
   })
   ↓
5. useOptimizerSync refetches:
   GET /api/workspaces/{workspaceId}/optimizer/context
   ↓
6. Returns activeItems with the signal above
   ↓
7. extractKeywordsFromContext() runs:
   for (const item of activeItems) {
     const metadata = item.metadata;
     if (metadata?.keywords && Array.isArray(metadata.keywords)) {
       // Found them! Extract and display
     }
   }
   ↓
8. Keywords appear in "Competitor Keywords" section ✅
```

---

## Files Modified

### `/src/lib/client/competitor-spy-staging-flow.ts`

**Line 177-193:**
- Moved `keywords: selectedKeywords` from top-level to inside `metadata` object
- Added comment explaining why this location is critical
- Removed duplicate top-level `keywords` field

---

## Verification Checklist

After deploying, test with these exact steps:

1. **Navigate to Competitor Spy**
   - Go to `/app/{workspaceId}/competitors`

2. **Select keywords from a competitor snapshot**
   - Click on a competitor (e.g., "MyFitnessPal")
   - Select 3-5 keywords from different categories
   - Verify floating action bar shows selection count

3. **Click "Send to AI Optimizer"**
   - Button text: "Send to AI Optimizer" or localized equivalent

4. **Check for toast notification** ✅
   - Green toast should appear: "Keywords staged for AI Listing Optimizer"
   - Toast should have description: "Sent X keywords from [Competitor] analysis"
   - Toast should have action button: "Go to Optimizer"

5. **Navigate to AI Listing Optimizer**
   - Click "Go to Optimizer" from toast, OR
   - Manually go to `/app/{workspaceId}/listing-optimizer`

6. **Verify keywords appear in Active Context**
   - Scroll to Step 3 (Final Optimization)
   - Look for "COMPETITOR KEYWORDS" section
   - Keywords should be displayed as colored pills:
     - 📊 Blue pills = High-Volume keywords
     - 🎯 Purple pills = Intent-Based keywords
     - 🔓 Orange pills = Competitor Gap keywords
   - Each pill should show the keyword term

7. **Verify deduplication**
   - If keywords were already staged from another competitor, verify no duplicates appear
   - Count should match total selected (or less if duplicates removed)

---

## Technical Details

### Why Metadata Structure Matters

The staging vault stores signals with this structure:
```sql
CREATE TABLE workspace_staging_vault (
  id UUID,
  workspace_id UUID,
  signal_type VARCHAR,
  content TEXT,
  language VARCHAR,
  metadata JSONB,  -- All custom data goes here
  created_at TIMESTAMP,
  deleted_at TIMESTAMP
);
```

The API endpoint (`/optimizer/context`) returns:
```typescript
interface OptimizerContext {
  activeItems: Array<{
    id: string;
    signalType: string;
    content: string;
    metadata: Record<string, unknown>;  // ← Everything custom is in metadata
    language: string;
    stagedAt: string;
  }>;
}
```

The extraction function expects:
```typescript
function extractKeywordsFromContext(activeItems: Array<{
  metadata?: Record<string, unknown>;
}>) {
  for (const item of activeItems) {
    const metadata = item.metadata;
    if (metadata?.keywords && Array.isArray(metadata.keywords)) {
      // Extract each keyword object
    }
  }
}
```

**Conclusion:** All custom data (including keywords) must be inside the `metadata` JSONB field.

---

## Before/After Comparison

### BEFORE (Broken)
```typescript
await addSignalToVault(supabase, workspaceId, {
  signalType: "optimization_insight",
  metadata: {
    competitor_id: competitorId,
    competitor_name: competitorName,
  },
  keywords: selectedKeywords,  // ← Wrong location!
});
```

Database stores:
```json
{
  "metadata": {
    "competitor_id": "comp-456",
    "competitor_name": "MyFitnessPal"
  },
  "keywords": [...]  // ← Unreachable by extraction function
}
```

Extraction result: `[]` (empty array) ❌

---

### AFTER (Fixed)
```typescript
await addSignalToVault(supabase, workspaceId, {
  signalType: "optimization_insight",
  metadata: {
    competitor_id: competitorId,
    competitor_name: competitorName,
    keywords: selectedKeywords,  // ← Correct location!
  },
});
```

Database stores:
```json
{
  "metadata": {
    "competitor_id": "comp-456",
    "competitor_name": "MyFitnessPal",
    "keywords": [...]  // ← Found by extraction function!
  }
}
```

Extraction result: `[KeywordDisplayItem, KeywordDisplayItem, ...]` ✅

---

## Debugging Steps (If Issue Persists)

### Check API Response
1. Open browser DevTools → Network tab
2. Click "Send to AI Optimizer"
3. Find POST request to `/api/workspaces/.../staging/add`
4. Check Response tab:
   - Should see: `{ "ok": true, "data": { "id": "...", "message": "..." } }`
   - If 422: Fix #1 (signalType)
   - If 500: Check server logs for error

### Check Database
```sql
-- Query Supabase directly
SELECT 
  id,
  signal_type,
  metadata,
  created_at
FROM workspace_staging_vault
WHERE signal_type = 'optimization_insight'
ORDER BY created_at DESC
LIMIT 1;
```

Look for: `metadata` should contain `keywords` array
```json
{
  "competitor_id": "...",
  "competitor_name": "...",
  "keywords": [
    { "term": "...", "category": "..." },
    ...
  ]
}
```

### Check Component Query
1. Open DevTools → Console
2. Check for logs starting with `[KeywordCurationFloatingBar]`
3. Should see:
   - `✅ STAGING SUCCESSFUL`
   - `🔄 INVALIDATING QUERY`
4. Then Optimizer should refetch and extract keywords

---

## Status

✅ **FIXED** - Both issues resolved:
1. ✅ `signalType: "optimization_insight"` (passes API validation)
2. ✅ `keywords: selectedKeywords` inside `metadata` (extraction succeeds)

**Expected Result:**
- Toast appears immediately
- Keywords display in Active Context within 1-2 seconds
- User can click "Go to Optimizer" to navigate and see keywords
