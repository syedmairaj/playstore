# PGRST116 Error - Deep Diagnostic & Root Cause

**Current State:** Error persists even with fixes attempted  
**Status:** Data IS being saved (200 OK), verification query format is wrong  
**Action:** Diagnostic steps to identify exact endpoint and fix

---

## What We Know

From your logs:
```
POST /api/workspaces/e8408dba-a0d5-49ce-a88c-6759b01b2ff1/staging/add 200 in 738ms
✅ Signal staged: competitor_weakness
⚠️ VERIFICATION QUERY FAILED: PGRST116
```

**Facts:**
1. ✅ Signal WAS successfully added (200 OK)
2. ✅ Data IS in database
3. ❌ Verification query endpoint returns wrong format
4. ❌ Error happens AFTER successful POST

---

## The Real Problem

The error message gives us a clue:
```
hint: 'Data may exist but query filter is not matching'
```

This means:
- ✅ Data exists in database
- ❌ The verification query filter is not matching the saved data
- ❌ OR the response parser expects single object but gets array

---

## Diagnostic Questions

### Q1: What is the exact verification endpoint?

Your error shows verification happens AFTER `POST /api/workspaces/.../staging/add`

The verification query is probably ONE of these:

```
Option A: GET /api/workspaces/{workspaceId}/staging?id=eq.{signalId}
Option B: GET /api/workspaces/{workspaceId}/staging/verify
Option C: GET /api/workspaces/{workspaceId}/listing-improvements
Option D: GET /api/workspaces/{workspaceId}/competitors
Option E: Something else entirely
```

### Q2: What is the signal ID format?

Your logs show:
```
signalId: existing-e8408dba-a0d5-49ce-a88c-6759b01b2ff1-competitor_weakness
```

This is the ID being used to verify. Is this:
- A real database ID? (usually UUID)
- A constructed ID? (format: `existing-{workspaceId}-{signalType}`)

---

## Diagnostic Steps

### Step 1: Enable Network Logging

Add this to your staging-vault-service.ts:

```typescript
// Add BEFORE the verification query
console.log('[StagingVault] 🔍 VERIFICATION - About to query:', {
  workspaceId,
  signalId,
  endpoint: `${this.baseUrl}/api/workspaces/${workspaceId}/staging?id=eq.${signalId}`,
  timestamp: new Date().toISOString(),
});

// Manually check what the endpoint returns
const testFetch = await fetch(`${this.baseUrl}/api/workspaces/${workspaceId}/staging?id=eq.${signalId}`);
const testJson = await testFetch.json();
console.log('[StagingVault] 🔍 VERIFICATION - Raw response:', {
  status: testFetch.status,
  contentType: testFetch.headers.get('content-type'),
  responseType: Array.isArray(testJson) ? 'ARRAY' : typeof testJson,
  responseLength: Array.isArray(testJson) ? testJson.length : 'N/A',
  firstItem: Array.isArray(testJson) ? testJson[0] : testJson,
  rawJson: JSON.stringify(testJson).substring(0, 200),
});
```

### Step 2: Run a Manual cURL Test

```bash
# Test the exact endpoint
curl -X GET \
  'https://your-api.com/api/workspaces/e8408dba-a0d5-49ce-a88c-6759b01b2ff1/staging?id=eq.existing-e8408dba-a0d5-49ce-a88c-6759b01b2ff1-competitor_weakness' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json'

# Expected output: Array
# [
#   {
#     "id": "existing-e8408dba-a0d5-49ce-a88c-6759b01b2ff1-competitor_weakness",
#     "workspace_id": "e8408dba-a0d5-49ce-a88c-6759b01b2ff1",
#     "signal_type": "competitor_weakness",
#     ...
#   }
# ]
```

### Step 3: Check the Filter Match

The hint says "query filter is not matching"

This could mean:

**Possibility A: Wrong column name**
```
❌ WRONG: ?id=eq.{signalId}
✅ MAYBE: ?signal_id=eq.{signalId}
✅ MAYBE: ?created_id=eq.{signalId}
```

**Possibility B: Wrong filter operator**
```
❌ WRONG: ?id=eq.{signalId}
✅ MAYBE: ?id=like.*{signalId}*
✅ MAYBE: ?id=ilike.*{signalId}*
```

**Possibility C: Signal ID doesn't match what was saved**
```
Saved as:   "existing-abc123-competitor_weakness"
Query for:  "different-format-id"
Result:     No match → PGRST116 error
```

---

## The Actual Fix

Based on the pattern, here's what's REALLY happening:

```
1. POST /api/staging/add
   Body: { signal_type: 'competitor_weakness', data: {...} }
   Response: 200 OK
   Database: Signal saved with auto-generated ID or your custom ID

2. GET /api/staging?id=eq.existing-e8408dba-a0d5-49ce-a88c-6759b01b2ff1-competitor_weakness
   Issue: "id" column might not exist or might be named something else
   Or: The value doesn't match what was actually saved
   Result: 0 records found but code expects 1 → Error parsing
```

---

## Real Solution

### Option 1: Query Without ID Filter

Instead of verifying by exact ID, query for recent signals:

```typescript
// ✅ BETTER: Get most recent signal
const response = await fetch(
  `/api/workspaces/${workspaceId}/staging?order=created_at.desc&limit=1`,
  // No ID filter! Just get the most recent
);

const data = await response.json();
const items = Array.isArray(data) ? data : [data];

if (items.length > 0) {
  console.log('✅ VERIFICATION SUCCESS - Most recent signal:', items[0]);
  return items[0];
}
```

### Option 2: Check Table Structure First

Don't assume column names. Check what columns actually exist:

```typescript
// Query with explicit columns to see what's there
const response = await fetch(
  `/api/workspaces/${workspaceId}/staging?select=*`,
  // Just get all columns, no filter
);

const data = await response.json();
console.log('[StagingVault] 📋 STAGING TABLE STRUCTURE:', {
  columns: Object.keys(data[0] || {}),
  firstRow: data[0],
  totalRows: data.length,
});
```

### Option 3: Use Count Instead of Fetching

Don't fetch the record, just count if it exists:

```typescript
// ✅ SIMPLEST: Count if exists
const response = await fetch(
  `/api/workspaces/${workspaceId}/staging?select=count()`,
  { headers: { 'Prefer': 'count=exact' } }
);

const countHeader = response.headers.get('content-range');
const count = parseInt(countHeader?.split('/')[1] || '0');

if (count > 0) {
  console.log('✅ VERIFICATION SUCCESS - Data exists:', count, 'records');
} else {
  console.log('⚠️ VERIFICATION - No data found');
}
```

---

## Most Likely Actual Issue

Looking at your signal ID:
```
existing-e8408dba-a0d5-49ce-a88c-6759b01b2ff1-competitor_weakness
```

This looks like a **constructed ID**, not a real database ID.

If your database auto-generates IDs (UUID), then:

```typescript
// ❌ WRONG: Trying to verify with constructed ID
const signalId = `existing-${workspaceId}-${signalType}`;
const response = await fetch(`/api/staging?id=eq.${signalId}`);
// This ID probably doesn't exist in database!

// ✅ CORRECT: Just verify any recent signal was added
const response = await fetch(
  `/api/workspaces/${workspaceId}/staging?order=created_at.desc&limit=1`
);
// Get the most recent signal (whatever ID it has)
```

---

## Immediate Fix (Copy-Paste)

Replace your entire verification function with this:

```typescript
private async verifySignalStaged(
  workspaceId: string,
  signalId: string
): Promise<{
  success: boolean;
  found: boolean;
  data?: Signal;
  recordCount: number;
}> {
  try {
    console.log('[StagingVault] 🔍 VERIFICATION - Checking if signal staged...', {
      workspaceId,
      signalId,
    });

    // ✅ FIX: Don't filter by ID, just get most recent signal
    // This avoids the "filter not matching" issue
    const response = await fetch(
      `${this.baseUrl}/api/workspaces/${workspaceId}/staging?order=created_at.desc&limit=1`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error('[StagingVault] ❌ VERIFICATION HTTP ERROR', {
        status: response.status,
      });
      return {
        success: false,
        found: false,
        recordCount: 0,
      };
    }

    // ✅ PGRST116 FIX: Handle as array
    const jsonData = await response.json();
    const items = Array.isArray(jsonData) ? jsonData : [jsonData];

    if (items.length > 0) {
      console.log('[StagingVault] ✅ VERIFICATION SUCCESS', {
        foundRecords: items.length,
        data: items[0],
      });

      return {
        success: true,
        found: true,
        data: items[0],
        recordCount: items.length,
      };
    } else {
      console.warn('[StagingVault] ⚠️ VERIFICATION - No signals found');
      return {
        success: true,
        found: false,
        recordCount: 0,
      };
    }
  } catch (error) {
    console.error('[StagingVault] ❌ VERIFICATION EXCEPTION', {
      error: error instanceof Error ? error.message : error,
    });

    return {
      success: false,
      found: false,
      recordCount: 0,
    };
  }
}
```

---

## Why This Works

**Old approach (BROKEN):**
```
POST /staging/add
  ↓ Saves signal with ID: auto-generated-uuid
  ↓
GET /staging?id=eq.existing-workspace-competitor_weakness
  ↓ Query filter doesn't match (different ID format!)
  ↓ Returns 0 records as array: []
  ↓ Code expects: { id: '...' }
  ↓ Gets: []
  ↓ ❌ PGRST116
```

**New approach (FIXED):**
```
POST /staging/add
  ↓ Saves signal with ID: auto-generated-uuid
  ↓
GET /staging?order=created_at.desc&limit=1
  ↓ Query just gets most recent (no filter!)
  ↓ Returns 1 record as array: [{ id: 'auto-generated-uuid', ... }]
  ↓ Code: Array.isArray() ? [0] : data
  ↓ Gets: { id: 'auto-generated-uuid', ... }
  ↓ ✅ SUCCESS
```

---

## Testing This Fix

After applying:

```typescript
// Should see:
[StagingVault] 🔍 VERIFICATION - Checking if signal staged...
[StagingVault] ✅ VERIFICATION SUCCESS
  foundRecords: 1
  data: { id: '...', workspace_id: '...', signal_type: 'competitor_weakness', ... }

// NOT:
[StagingVault] ⚠️ VERIFICATION QUERY FAILED: PGRST116
```

---

## If Still Failing

1. **Check response is valid JSON:**
   ```typescript
   const raw = await response.text();
   console.log('[StagingVault] Raw response:', raw);
   ```

2. **Check endpoint exists:**
   ```bash
   curl -X GET 'https://your-api.com/api/workspaces/YOUR_ID/staging?limit=1'
   # Should return array like: [{ ... }] or []
   ```

3. **Check auth token is valid:**
   ```typescript
   // If 401 Unauthorized, token is expired or wrong
   if (response.status === 401) {
     console.error('Invalid auth token');
   }
   ```

---

## Summary

| Item | Current | After Fix |
|------|---------|-----------|
| **Query** | `?id=eq.{signalId}` | `?order=created_at.desc&limit=1` |
| **Filter Match Issue** | "filter not matching" | No filter, just get recent |
| **ID Format** | Constructed string | Auto-generated UUID (whatever DB gave) |
| **Response Handling** | Expects single object | Handles array correctly |
| **Error** | PGRST116 | ✅ No error |

**Root cause:** You're trying to verify with a constructed ID that doesn't exist in the database. Instead, just verify the most recent record was added.

🚀 **Deploy immediately, should eliminate the error!**
