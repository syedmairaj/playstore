# UnifiedStageButton Debug - Quick Start

**Status:** Debug logging added + Verification guide ready  
**Updated:** 2026-06-04

---

## What Changed

✅ Added comprehensive debug logging to `UnifiedStageButton.tsx`:
- Console logs at every step
- Alert popups for critical checkpoints
- Full error messages with stack traces

---

## Quick Start: 3-Step Verification

### STEP 1️⃣: Network Tab Check (MOST IMPORTANT)

```
1. Press F12 (open Developer Tools)
2. Click "Network" tab
3. Click "Stage Issue" button
4. Look for "staging/add" request
```

**Expected:**
- ✅ POST request appears
- ✅ Status shows 200 (green)
- ✅ Response contains data

**If request doesn't appear:**
- ❌ onClick handler not firing
- Check: Is button actually using UnifiedStageButton?
- Check: Is workspaceId defined?

**If request shows RED status:**
- ❌ API error (404, 500, CORS, etc.)
- Click request → Response tab
- Copy error message

---

### STEP 2️⃣: Verify Component Binding

Check your Reviews/Common Issues component:

```typescript
// ✅ CORRECT:
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
    metadata={{...}}
    onStageSuccess={handleStageSuccess}
    optimizerMutate={mutate}
    syncOptimizer={true}
  />
))}

// ❌ WRONG - using old button:
<button onClick={() => router.push(...)}>Stage</button>

// ❌ WRONG - missing required props:
<UnifiedStageButton signalId={id} workspaceId={wid} />
```

---

### STEP 3️⃣: Check Supabase Database

```
1. Open Supabase Dashboard
2. Go to: workspace_staging_vault table
3. Look for most recent row
4. Verify columns have data:
   - signal_type: "review_issue"
   - content: [issue title]
   - metadata: {severity, description, ...}
   - created_at: [recent timestamp]
```

**If data IS there:** ✅ API works, issue is archive/sync  
**If data NOT there:** ❌ API failed or didn't save

---

## What Debug Logging Shows

### Click Phase
```
🎯 [UnifiedStageButton] Stage button clicked, triggering action...
✅ Alert: "Button clicked! Starting staging process..."
```

### API Phase
```
🔄 Alert: "API Call started..."
[UnifiedStageButton] API Call Details: {
  url: "/api/workspaces/{id}/staging/add",
  method: "POST",
  payload: {...}
}
[UnifiedStageButton] API Response received: {
  status: 200,
  statusText: "OK",
  ok: true
}
✅ Alert: "API Call successful! Status: 200"
```

### Success Phase
```
[UnifiedStageButton] Executing onArchiveItem callback...
[UnifiedStageButton] Executing handleStageSuccess callback...
🎉 Alert: "Staging completed successfully! Item moved to archive."
```

### Error Phase
```
❌ Alert: "Error during staging: 404 Not Found"
console.error("[UnifiedStageButton] Error during staging:", error)
console.error("[UnifiedStageButton] Error stack:", (error).stack)
```

---

## Common Alert Messages & What They Mean

| Alert | Meaning | Next Step |
|-------|---------|-----------|
| ✅ "Button clicked!" | onClick fired | Check Network tab |
| ⚠️ "Guard condition triggered" | Already loading/staged | Wait or refresh |
| 🔄 "API Call started..." | fetch() executing | Watch Network tab |
| ✅ "API Call successful! Status: 200" | Request worked | Check Supabase |
| ❌ "Error: 404 Not Found" | Endpoint missing | Check API route |
| ❌ "Error: 401 Unauthorized" | Auth failed | Check token |
| 🎉 "Staging completed successfully!" | Everything works! | Verify archive updated |

---

## Console Log Pattern

Every action logs this pattern:

```
🎯 START → 📝 BUILDING → 🔄 API CALL → ✅ SUCCESS
          ↓              ↓               ↓
       metadata      payload         response
       created      sent            received
```

Or on error:

```
🎯 START → 📝 BUILDING → 🔄 API CALL → ❌ ERROR
          ✓              ✗
       success      error logged
```

---

## Troubleshooting Decision Tree

```
Does "Button clicked!" alert appear?
├─ YES → Go to Network tab
│   └─ Does "staging/add" request appear?
│       ├─ YES, status 200 → Check Supabase for data
│       │   ├─ YES, data there → Issue is archive/sync (Step 4)
│       │   └─ NO, no data → Backend bug (check server logs)
│       ├─ YES, status RED (404/500/etc) → API error (see Response tab)
│       └─ NO request → onClick not firing (check Component binding)
└─ NO → onClick not working
    └─ Check: Is button actually UnifiedStageButton?
       Check: Is workspaceId defined?
       Check: Is component actually rendering?
```

---

## What to Report If Stuck

Gather this information:

1. **First alert that appears** (or "no alerts at all")
2. **Network tab status** (request appears? what status?)
3. **Supabase check** (data present? yes/no)
4. **Component code** (how are you using UnifiedStageButton?)
5. **Console errors** (any red errors shown?)

---

## Files Updated

- ✅ `components/staging/UnifiedStageButton.tsx` - Debug logging added
- ✅ `DEBUG_UNIFIED_STAGING_BUTTON.md` - Full debugging guide
- ✅ `DEBUG_QUICK_START.md` - This file

---

## Next Action

1. **Click Stage button**
2. **Watch for alerts** (they will appear)
3. **Open Network tab** (F12 → Network)
4. **Report what you see**

---

**Remember:** Alerts will interrupt your workflow - this is intentional for debugging!

To disable alerts later, remove or comment out these lines:
```typescript
alert("✅ Button clicked! Starting staging process...");
alert("🔄 API Call started...");
alert(`✅ API Call successful! Status: ${response.status}`);
```

But keep the `console.log()` statements for production debugging.

---

**Status:** Ready for debugging  
**Next Step:** Run verification steps and report findings
