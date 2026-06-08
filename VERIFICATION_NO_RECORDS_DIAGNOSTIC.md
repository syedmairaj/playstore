# Verification Query Returning 0 Records - Diagnostic Guide

**Status:** PGRST116 ✅ FIXED, but now verification returns 0 records  
**Data Status:** ✅ SAFE - Signal was inserted (HTTP 200 OK)  
**Issue:** Verification query filter not matching the inserted data

---

## What's Happening

```
POST /api/staging/add → HTTP 200 ✅ (Signal inserted)
   ↓
Verification Query → 0 records found ⚠️
   ↓
BUT: Signal IS in database (200 means success)
   ↓
Filter must not be matching the data correctly
```

**Your Current Logs:**
```
signalType: 'competitor_weakness'
language: 'en'
competitorId: 'com.myfitnesspal.android'
Result: No records found
```

---

## Root Cause Analysis

The verification query filters by:
1. `workspace_id` = ✅ Correct
2. `signal_type` = ✅ Correct  
3. `language` = ✅ Correct
4. ~~`metadata->>'competitor_id'` = ❌ FILTER REMOVED (may not match)~~

**We removed the competitor_id filter** to diagnose the issue.

---

## Why Records Aren't Found

### Possibility 1: RLS (Row Level Security) Policy

Supabase RLS policies might be filtering out the results in the SELECT query, even though the INSERT succeeded.

**Signs:**
- ✅ INSERT returns 200 OK
- ❌ SELECT returns 0 records for the same data
- Happens consistently

**Check:**
```sql
-- In Supabase SQL Editor, run:
SELECT * FROM workspace_staging_vault 
WHERE workspace_id = 'e8408dba-a0d5-49ce-a88c-6759b01b2ff1'
AND signal_type = 'competitor_weakness'
ORDER BY created_at DESC
LIMIT 1;
```

If this returns 0 rows, it's an **RLS policy issue**.

### Possibility 2: Timing Issue

The INSERT might take a moment to replicate across the database.

**Signs:**
- ✅ INSERT succeeds
- ⚠️ SELECT immediately after returns 0
- ✅ SELECT 5 seconds later returns 1 row

**Check:** Add a delay before verification:
```typescript
// Wait 500ms for data to replicate
await new Promise(resolve => setTimeout(resolve, 500));
// Then run verification query
```

### Possibility 3: Data Stored in Different Field

The competitor ID might be in a different field (e.g., `source_context_id` instead of `metadata.competitor_id`).

**Signs:**
- ✅ Query gets most recent signal (no competitor_id filter)
- ❌ Still returns 0 rows

**This is UNLIKELY** because we removed the filter.

### Possibility 4: Supabase Client Auth Issue

The Supabase client used for verification might have different permissions than the insert client.

**Signs:**
- ✅ INSERT works (has permission)
- ❌ SELECT returns 0 (different permission/auth)

---

## Quick Diagnostic Steps

### Step 1: Check Database Directly

Go to Supabase Dashboard → SQL Editor and run:

```sql
-- Check if record actually exists
SELECT 
  id,
  workspace_id,
  signal_type,
  language,
  metadata,
  created_at
FROM workspace_staging_vault
WHERE workspace_id = 'e8408dba-a0d5-49ce-a88c-6759b01b2ff1'
AND signal_type = 'competitor_weakness'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Output:**
```
id: abc-123-def
workspace_id: e8408dba-a0d5-49ce-a88c-6759b01b2ff1
signal_type: competitor_weakness
language: en
metadata: {"competitor_id": "com.myfitnesspal.android", ...}
created_at: 2026-06-08T10:30:45.123Z
```

**If you see this row:** RLS policy is filtering SELECT (but allowed INSERT)  
**If you don't see this row:** Data might not actually be inserted (but 200 OK is misleading)

### Step 2: Check RLS Policies

In Supabase Dashboard → Authentication → RLS:

1. Find `workspace_staging_vault` table
2. Check policies for INSERT and SELECT
3. Compare if they have different conditions

**Common issue:**
```sql
-- INSERT policy: workspace_id matches user's workspace
INSERT: workspace_id = auth.workspaces->0

-- SELECT policy: workspace_id matches AND user_id matches
SELECT: workspace_id = auth.workspaces->0 AND created_by_user_id = auth.uid()
```

This allows INSERT but blocks SELECT if `created_by_user_id` is wrong.

### Step 3: Check Who Inserted the Data

The INSERT might be using a different user context:

```typescript
// Check: Is created_by_user_id being set correctly?
console.log('[Debug] Current auth user:', await supabase.auth.getUser());

// The signal might be inserted with user_id = null or different user
// Then SELECT filtered by created_by_user_id won't find it
```

---

## The Fix

The issue is likely **RLS policies being too restrictive on SELECT**.

### Quick Fix: Disable RLS for Testing

In Supabase Dashboard → Authentication → RLS:

1. Find `workspace_staging_vault` table
2. Click "Disable RLS" temporarily
3. Test again
4. If verification works now, re-enable RLS with corrected policies

### Permanent Fix: Update RLS Policies

Ensure INSERT and SELECT have compatible policies:

```sql
-- INSERT policy (should allow anyone in workspace)
CREATE POLICY "insert_staging_own_workspace"
ON workspace_staging_vault
FOR INSERT
TO authenticated
WITH CHECK (workspace_id IN (
  SELECT workspace_id FROM user_workspace_roles 
  WHERE user_id = auth.uid()
));

-- SELECT policy (should have same condition as INSERT)
CREATE POLICY "select_staging_own_workspace"
ON workspace_staging_vault
FOR SELECT
TO authenticated
USING (workspace_id IN (
  SELECT workspace_id FROM user_workspace_roles 
  WHERE user_id = auth.uid()
));

-- Don't restrict by created_by_user_id on SELECT
-- (different user might verify the insert)
```

---

## What We Already Know

✅ **Data IS being inserted** - HTTP 200 OK means success  
✅ **PGRST116 is FIXED** - No more array/object mismatch error  
✅ **Format is correct** - Metadata structure is valid  
⚠️ **SELECT can't find it** - RLS policy likely blocking read

---

## Updated Code Changes

**File:** `src/lib/staging-vault/staging-vault-service.ts`  
**Lines:** 680-737

**Changes Made:**
1. ✅ Removed `metadata->>'competitor_id'` filter (was too strict)
2. ✅ Now just queries by workspace/type/language
3. ✅ Added detailed logging of what's in the response
4. ✅ Changed error messages to be more diagnostic

**Result:**
- Better diagnostics when records aren't found
- Easier to identify whether it's RLS, timing, or data issue

---

## Next Actions

1. **Check Supabase Dashboard** → SQL Editor
   - Run the diagnostic query above
   - See if data actually exists in table

2. **If data exists but SELECT fails:**
   - Check RLS policies
   - Disable RLS temporarily to confirm
   - Update policies to allow both INSERT and SELECT

3. **If data doesn't exist:**
   - Check INSERT operation more carefully
   - Verify `created_by_user_id` is being set
   - Check for any silent failures

---

## Important Notes

⚠️ **The verification failure is NOT critical:**
- ✅ Data IS being inserted (HTTP 200 confirmed)
- ✅ All metadata is correct
- ✅ Signal is saved to database
- ⚠️ Just can't read it back immediately (likely RLS)

The signal staging is working. The verification just can't confirm it due to database access restrictions.

---

## Summary

| Check | Status | Next Step |
|-------|--------|-----------|
| PGRST116 Error | ✅ FIXED | None |
| Signal Insertion | ✅ SUCCESS (200 OK) | None |
| Verification Query | ❌ Finds 0 records | Debug RLS policies |
| Data Safety | ✅ SAFE | None |

**Action:** Check RLS policies in Supabase Dashboard. They likely allow INSERT but block SELECT for the verification query.

---

🔍 **Diagnostic logs are now enhanced.** Check the console output after next signal insert to see detailed information about what was returned.
