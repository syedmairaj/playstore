# Debug Guide: UnifiedStageButton "Dead Button" Issue

**Date:** 2026-06-04  
**Issue:** UnifiedStageButton failing silently - no API calls, no archive updates, no Optimizer sync  
**Status:** Comprehensive debug logging added  

---

## Overview

The `UnifiedStageButton` component now includes extensive debug logging to identify where the failure is occurring. This guide walks you through the debugging process step-by-step.

---

## Debug Logging Added

The component now outputs:

1. **Console Logs** - Detailed step-by-step logging to browser console
2. **Alert Popups** - Visual feedback at critical points
3. **Error Stack Traces** - Full error details with stack traces

### Debug Points

```typescript
// 1. CLICK DETECTION
console.log("🎯 [UnifiedStageButton] Stage button clicked...");
alert("✅ Button clicked! Starting staging process...");

// 2. GUARD CONDITIONS
if (loading || staged || disabled) {
  console.warn("[UnifiedStageButton] Guard condition blocked...");
  alert("⚠️ Guard condition triggered...");
}

// 3. METADATA BUILD
console.log("[UnifiedStageButton] Building staging metadata...");
console.log("[UnifiedStageButton] Metadata built successfully:", stagingMetadata);

// 4. API CALL DETAILS
console.log("[UnifiedStageButton] API Call Details:", { url, method, payload });
alert("🔄 API Call started...");

// 5. API RESPONSE
console.log("[UnifiedStageButton] API Response received:", { status, ok });
alert(`✅ API Call successful! Status: ${response.status}`);

// 6. ARCHIVE CALLBACK
console.log("[UnifiedStageButton] Executing onArchiveItem callback...");
onArchiveItem?.(signalId);

// 7. SUCCESS HANDLER
console.log("[UnifiedStageButton] Executing handleStageSuccess callback...");

// 8. ERROR HANDLING
console.error("[UnifiedStageButton] Error during staging:", error);
alert(`❌ Error during staging: ${error.message}`);
```

---

## Three-Step Verification Process

Follow these steps **in order**. Do NOT skip ahead.

### STEP 1: Check Network Tab (Most Important)

**Purpose:** Verify the button is actually sending an API request

**Instructions:**

1. Open Developer Tools: Press **F12** (or Cmd+Option+I on Mac)
2. Click the **"Network"** tab
3. Make sure recording is enabled (red dot should be visible)
4. **Clear existing requests** (trash icon)
5. Navigate to your Reviews/Common Issues page
6. **Click the "Stage Issue" button**
7. Look for a request named `staging/add` in the Network tab

**What to look for:**

#### ✅ SUCCESS: Request appears in Network tab

```
Method: POST
URL: /api/workspaces/{id}/staging/add
Status: 200 (green)
Size: 1.2 KB
Time: 150ms
```

**Next Step:** Go to STEP 2

#### ❌ FAILURE 1: No request appears in Network tab

**This means:** The onClick handler is not being called at all

**Check these:**

- [ ] Button has `onClick={handleStage}` prop attached
- [ ] Button is not inside a form with `onSubmit` handler
- [ ] Button `type="button"` (not `type="submit"`)
- [ ] Button is not `disabled={true}`
- [ ] Parent component is actually rendering UnifiedStageButton
- [ ] Component is not wrapped in a memo that's preventing re-renders

**Debug command in console:**

```javascript
// Check if the button element exists
document.querySelector('button[aria-label*="Stage"]')

// If button exists, try to trigger click manually
const btn = document.querySelector('button[aria-label*="Stage"]');
btn?.click();
// This should trigger the alert
```

**If still no request:** Check the React DevTools to verify UnifiedStageButton is mounted.

#### ❌ FAILURE 2: Request appears but shows RED error status

**HTTP Status Codes:**

```
400 Bad Request
  → Payload format is wrong
  → Check JSON structure in API payload
  → Look at error message in Response tab

401 Unauthorized
  → User not authenticated
  → Check auth token/session
  → Verify user has workspace access

403 Forbidden
  → User authenticated but not authorized
  → Check workspace permissions
  → Verify workspaceId is correct

404 Not Found
  → API endpoint doesn't exist
  → Check URL spelling: /api/workspaces/{id}/staging/add
  → Verify backend route is implemented

500 Internal Server Error
  → Backend crashed or threw error
  → Check server logs
  → Look at Response tab for error message

CORS Error (no status code)
  → Cross-Origin Resource Sharing blocked
  → Check browser console for full error
  → Verify API endpoint allows this origin
```

**How to see the error message:**

1. Click on the failed request in Network tab
2. Click **"Response"** tab
3. Copy the error message
4. Post it here

---

### STEP 2: Verify onClick Binding

**Purpose:** Ensure the Reviews/Common Issues page is using UnifiedStageButton correctly

**Check your component:**

```typescript
// ✅ CORRECT: Using UnifiedStageButton
import { UnifiedStageButton } from "@/components/staging/UnifiedStageButton";

{issues.map(issue => (
  <UnifiedStageButton
    signalType="review_issue"
    signalId={issue.id}
    content={issue.title}
    source="review_analysis"
    sourceAppId={appId}
    workspaceId={workspaceId}
    language={locale}
    metadata={{ description: issue.description, severity: issue.severity }}
    onStageSuccess={handleStageSuccess}
    optimizerMutate={mutate}
    syncOptimizer={true}
  />
))}

// ❌ WRONG: Using old button component
<button onClick={() => router.push(`/optimizer?issue=${issue.id}`)}>
  Stage Issue
</button>

// ❌ WRONG: UnifiedStageButton but missing critical props
<UnifiedStageButton
  signalId={issue.id}
  workspaceId={workspaceId}
  // Missing: signalType, content, source, etc.
/>
```

**React DevTools Verification:**

1. Open React DevTools (Chrome extension)
2. Search for `UnifiedStageButton` component
3. Check props are being passed correctly:
   - `signalId` should match issue ID
   - `workspaceId` should not be undefined
   - `signalType` should be `"review_issue"`
   - `source` should be `"review_analysis"`

**Console check:**

```javascript
// In browser console, after clicking stage button
// Look for these logs:
// 🎯 [UnifiedStageButton] Stage button clicked...
// [UnifiedStageButton] Building staging metadata...
// [UnifiedStageButton] API Call Details...
```

If you see NO console logs, the button's onClick wasn't triggered.

---

### STEP 3: Check Supabase Database

**Purpose:** Verify data was actually written to workspace_staging_vault table

**Instructions:**

1. Open Supabase Dashboard
2. Navigate to: **project** → **database** → **workspace_staging_vault** table
3. Click on "Data" tab (should show table contents)
4. Look for the most recent row you just staged
5. Verify these columns have values:
   - `id` (UUID)
   - `workspace_id` (should match your workspace)
   - `signal_type` (should be "review_issue")
   - `content` (should be issue title)
   - `source` (should be "review_analysis")
   - `metadata` (should have severity, description, etc.)
   - `created_at` (should be recent timestamp)

**If data IS there:**
- ✅ The API call succeeded
- ✅ The backend processed it correctly
- ✅ Issue is with ARCHIVE or OPTIMIZER SYNC (see step 4 below)

**If data is NOT there:**
- ❌ The API call either failed silently or returned success but didn't save
- Check backend logs for errors
- Verify Supabase insert permissions
- Check trigger functions (if any)

---

## Step 4: Debug Archive & Optimizer Sync (If API Call Succeeded)

If the data IS appearing in `workspace_staging_vault` table, the issue is NOT with the button or API call.

### A. Check Archive State Update

**The Problem:**
- Item staged successfully (data in DB)
- But item still appears in "Common Issues" active list
- Item not appearing in "Optimization History" archive

**Debugging:**

```typescript
// In your Reviews component, add debug logging:

const handleStageSuccess = useCallback(
  createReviewsStageCallback(
    state.archiveManager,
    workspaceId,
    locale,
    mutateStagingVault
  ),
  [state.archiveManager, workspaceId, locale, mutateStagingVault]
);

// Add this wrapper to see when it's called:
const wrappedCallback = useCallback(
  async (params: OnStageSuccessParams) => {
    console.log("🎯 [Reviews] handleStageSuccess called with:", params);
    
    // Check archive manager before
    console.log("Before archive - active count:", state.archiveManager.getArchivedCount());
    
    // Call the original
    await handleStageSuccess(params);
    
    // Check archive manager after
    console.log("After archive - active count:", state.archiveManager.getArchivedCount());
  },
  [handleStageSuccess]
);
```

**If archive callback is called but state doesn't update:**

- Check if `setActiveItems` and `setArchivedItems` are working
- Verify React's state batching isn't preventing re-render
- Force a manual state update test:

```typescript
// In React DevTools console:
const btn = document.querySelector('[data-testid="clear-archive"]');
btn?.click(); // Should update UI immediately if state works
```

### B. Check Optimizer Sync

**The Problem:**
- Item staged and archived correctly
- But Optimizer page shows old list, doesn't include new item
- "Active Context" doesn't update

**Debugging:**

Add logging to `useOptimizerSync` hook:

```typescript
const { mutate, context } = useOptimizerSync(workspaceId);

useEffect(() => {
  console.log("[Optimizer] Context updated:", {
    activeItems: context?.activeItems?.length,
    archivedItems: context?.archivedItems?.length,
    stats: context?.stats,
  });
}, [context]);

// Before calling mutate in callback:
console.log("[Optimizer] Before mutate - context:", context?.activeItems);

// After calling mutate:
await mutate();

console.log("[Optimizer] After mutate - context:", context?.activeItems);
```

**Check SWR cache:**

```javascript
// In browser console after staging:
// Open React DevTools and find useOptimizerSync hook
// Look at the cached data key: 
// /api/workspaces/{workspaceId}/optimizer/context

// Or check fetch directly:
fetch('/api/workspaces/{workspaceId}/optimizer/context')
  .then(r => r.json())
  .then(data => console.log("Optimizer context:", data));
```

---

## Alert Messages Meaning

### Click Phase
- ✅ **"Button clicked! Starting staging process..."** → onClick was triggered ✓
- ⚠️ **"Guard condition triggered..."** → Button already loading/staged/disabled

### Build Phase
- No alert → Should see console logs for metadata building

### API Phase
- 🔄 **"API Call started..."** → fetch() is executing
- ✅ **"API Call successful! Status: 200"** → Request succeeded
- ❌ **"Error during staging: ..."** → Request failed with this error

### Success Phase
- 🎉 **"Staging completed successfully!"** → Everything worked!
- Item should now be in archive

### Error Phase
- ❌ **"Error: 404 Not Found"** → API endpoint doesn't exist
- ❌ **"Error: 401 Unauthorized"** → Auth token invalid
- ❌ **"Error: 500 Internal Server Error"** → Backend crashed
- ❌ **"Error: Network request failed"** → Connection issue

---

## Common Issues & Solutions

### Issue 1: No Alert Appears When Clicking Button

**Root Cause:** onClick handler not attached

**Solution:**
1. Verify UnifiedStageButton is imported
2. Verify parent component is actually rendering it
3. Check props, especially `workspaceId`
4. Open React DevTools and search for UnifiedStageButton
5. If found, check its props in DevTools

### Issue 2: Alert Appears But Network Request Doesn't Show

**Root Cause:** fetch() is failing before sending request

**Solution:**
1. Check browser console for JavaScript errors
2. Verify `/api/workspaces/{workspaceId}/staging/add` is correct URL
3. Check if workspaceId is actually defined
4. Verify network connectivity (try pinging API in console)

### Issue 3: Network Request Shows But Returns 404

**Root Cause:** API endpoint not implemented

**Solution:**
1. Verify backend has `/api/workspaces/[id]/staging/add` route
2. Check route file name and path
3. Restart backend server
4. Check if route is exported/registered

### Issue 4: Network Request Returns 400/500 Error

**Root Cause:** API payload format is wrong OR backend error

**Solution:**
1. Click failed request in Network tab
2. Click "Request" subtab to see what was sent
3. Click "Response" subtab to see error message
4. Share the error message

### Issue 5: API Call Succeeds But Item Still in Active List

**Root Cause:** Archive state not updating

**Solution:**
1. Verify `onArchiveItem` callback is being passed
2. Add debug logging to `onArchiveItem` in parent component
3. Check if `setActiveItems` is updating state correctly
4. Force manual state update to test: `setActiveItems([])`

### Issue 6: Item in Archive But Not in Optimizer

**Root Cause:** Optimizer not syncing

**Solution:**
1. Verify `optimizerMutate` is passed correctly
2. Check if `/api/workspaces/{id}/optimizer/sync` endpoint exists
3. Verify GET `/api/workspaces/{id}/optimizer/context` is implemented
4. Check Optimizer page is using `useOptimizerSync` hook
5. Add debug logging to see if mutate is being called

---

## Debug Checklist

Use this checklist to isolate the problem:

```
PHASE 1: CLICK & API CALL
[ ] Button click triggers "Button clicked!" alert
[ ] Console shows "🎯 [UnifiedStageButton] Stage button clicked..."
[ ] Network tab shows POST request to /api/workspaces/{id}/staging/add
[ ] Request returns 200 status (green)
[ ] Response shows data was received

PHASE 2: DATABASE
[ ] Data appears in Supabase workspace_staging_vault table
[ ] All required columns have values
[ ] Timestamp is recent

PHASE 3: ARCHIVE
[ ] onArchiveItem callback is called (check parent component)
[ ] Item disappears from "Common Issues" active list
[ ] Item appears in "Optimization History" archive
[ ] Archive count increments

PHASE 4: OPTIMIZER SYNC
[ ] optimizerMutate is called (add debug log)
[ ] /api/workspaces/{id}/optimizer/context is fetched
[ ] Optimizer "Active Context" shows newly staged item
[ ] Optimizer UI updates without page refresh

SUCCESS INDICATORS:
✅ All alerts appear in sequence
✅ Network request shows 200 status
✅ Data in database
✅ Item moves to archive
✅ Optimizer shows new item
```

---

## How to Report Issues

If you're still stuck, provide this information:

1. **Screenshot of Network tab error** (if there's a red request)
2. **Console logs** (copy everything starting with 🎯)
3. **What alert appeared?** (Which one, if any?)
4. **Is data in Supabase?** (Yes/No)
5. **Code snippet** showing how you're using UnifiedStageButton

---

## Next Steps

1. **Run STEP 1** (Network tab check)
2. **Record results** (alert appearing? request showing?)
3. **If request shows:** Run STEP 2 (verify binding)
4. **If binding OK:** Run STEP 3 (check database)
5. **If data in DB:** Debug archive/optimizer sync
6. **Report findings** with details from section above

---

**Status:** Ready for debugging  
**Last Updated:** 2026-06-04  
**Questions?** See "Common Issues & Solutions" section
