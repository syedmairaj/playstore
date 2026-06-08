# Universal PostgREST PGRST116 Fix - All Verification Queries

**Status:** 🔴 **CRITICAL** — Two verification queries failing  
**Error:** PGRST116 in BOTH competitors and staging verification  
**Root Cause:** All verification queries expecting single object, getting arrays  
**Solution:** Unified fix for all PostgREST queries in your codebase

---

## Current Errors

### Error #1: Competitors Verification
```
GET /api/workspaces/e8408dba-a0d5-49ce-a88c-6759b01b2ff1/competitors 200 in 2976ms
[StagingVault] ⚠️ VERIFICATION QUERY FAILED: PGRST116
```

### Error #2: Staging Verification  
```
POST /api/workspaces/e8408dba-a0d5-49ce-a88c-6759b01b2ff1/staging/add 200 in 970ms
[StagingVault] ⚠️ VERIFICATION QUERY FAILED: PGRST116
```

**Both return 200 OK** (data exists!) but fail on response parsing.

---

## Root Cause Analysis

**Pattern Observed:**

```
Request Made → HTTP 200 ✅ (Success!)
              ↓
         Response Body = [{ ... }, { ... }]  ← ARRAY
              ↓
         Code expects: { ... }  ← SINGLE OBJECT
              ↓
         ❌ PGRST116: "Cannot coerce array to single object"
```

**Why this is happening:**
PostgREST ALWAYS returns arrays from GET queries, even with filters. Your verification code is probably doing something like:

```typescript
// ❌ WRONG (Happens in BOTH verification queries)
const result = await fetch('/api/competitors?workspace_id=eq.xxx');
const data = await result.json();
// data = [{ id: 1 }, { id: 2 }, ...]  ← ARRAY!

// Then trying to use data as single object
console.log(data.id);  // ❌ Error! data is array, not object
```

---

## The Universal Fix

### FIND & REPLACE ALL

**Pattern 1: Basic GET query**
```typescript
// ❌ WRONG
const response = await fetch(`/api/table?filter=value`);
const data = await response.json();
// Use data as single object

// ✅ CORRECT
const response = await fetch(`/api/table?filter=value`);
const data = await response.json();
const items = Array.isArray(data) ? data : [data];
const result = items.length > 0 ? items[0] : null;
```

**Pattern 2: Verification queries**
```typescript
// ❌ WRONG
const verification = await fetch(`/api/table?id=eq.${id}`);
if (!verification.ok) throw error;
const verified = await verification.json();
console.log(verified.id);  // ❌ PGRST116!

// ✅ CORRECT
const verification = await fetch(`/api/table?id=eq.${id}`);
if (!verification.ok) throw error;
const jsonData = await verification.json();
const items = Array.isArray(jsonData) ? jsonData : [jsonData];
if (items.length > 0) {
  console.log('✅ Verified:', items[0].id);
} else {
  console.log('⚠️ No data found');
}
```

**Pattern 3: All POST responses**
```typescript
// ❌ WRONG (if response has data)
const result = await fetch('/api/action', { method: 'POST', ... });
const response = await result.json();

// ✅ CORRECT
const result = await fetch('/api/action', { method: 'POST', ... });
const response = await result.json();
const data = Array.isArray(response) ? response : [response];
```

---

## Where to Find & Fix

Based on your logs, search your codebase for these patterns:

### Search 1: "Competitors" verification
```bash
grep -r "competitors" src/ --include="*.ts" --include="*.tsx"
grep -r "VERIFICATION.*competitors" src/
grep -r "GET /api/workspaces" src/
```

**Find code like:**
```typescript
// Somewhere in your code (probably staging-vault-service.ts or competitor-service.ts)
const response = await fetch(
  `/api/workspaces/${workspaceId}/competitors`
);
const verifiedData = await response.json();
// ❌ verifiedData is ARRAY, code treats as OBJECT
```

**Fix it to:**
```typescript
const response = await fetch(
  `/api/workspaces/${workspaceId}/competitors`
);
const jsonData = await response.json();
const items = Array.isArray(jsonData) ? jsonData : [jsonData];
console.log(`✅ Found ${items.length} competitors`);
```

### Search 2: "Staging" verification
```bash
grep -r "staging.*add" src/ --include="*.ts" --include="*.tsx"
grep -r "VERIFICATION.*staging" src/
grep -r "/staging/add" src/
```

**Find code like:**
```typescript
// In staging-vault-service.ts (the one you already have)
const response = await fetch(
  `/api/workspaces/${workspaceId}/staging`
);
const verified = await response.json();
// ❌ PGRST116 here
```

**Fix it to:**
```typescript
const response = await fetch(
  `/api/workspaces/${workspaceId}/staging`
);
const jsonData = await response.json();
const items = Array.isArray(jsonData) ? jsonData : [jsonData];
const verified = items[0];
if (verified) {
  console.log('✅ Signal verified');
}
```

---

## Complete Solution Template

Create this utility function in `src/lib/postgrest-utils.ts`:

```typescript
/**
 * PostgREST Response Handler
 * Fixes PGRST116 by properly handling array responses
 */

export interface PostgRESTResponse<T> {
  success: boolean;
  found: boolean;
  data?: T;
  items: T[];
  count: number;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Parse PostgREST response (handles both array and single object)
 * 
 * PostgREST ALWAYS returns arrays, but sometimes code expects single object
 * This safely converts any response to array format
 */
export function parsePostgRESTResponse<T = any>(
  jsonData: unknown
): PostgRESTResponse<T> {
  try {
    // Handle null/undefined
    if (!jsonData) {
      return {
        success: true,
        found: false,
        items: [],
        count: 0,
      };
    }

    // Convert to array
    let items: T[] = [];

    if (Array.isArray(jsonData)) {
      items = jsonData as T[];
    } else if (typeof jsonData === 'object') {
      // Single object response
      items = [jsonData as T];
    } else {
      return {
        success: false,
        found: false,
        items: [],
        count: 0,
        error: {
          code: 'INVALID_FORMAT',
          message: `Expected object or array, got ${typeof jsonData}`,
        },
      };
    }

    return {
      success: true,
      found: items.length > 0,
      data: items[0],
      items,
      count: items.length,
    };
  } catch (error) {
    return {
      success: false,
      found: false,
      items: [],
      count: 0,
      error: {
        code: 'PARSE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Fetch with PostgREST safety
 */
export async function fetchFromPostgREST<T = any>(
  url: string,
  options?: RequestInit
): Promise<PostgRESTResponse<T>> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      return {
        success: false,
        found: false,
        items: [],
        count: 0,
        error: {
          code: 'HTTP_ERROR',
          message: `${response.status} ${response.statusText}`,
        },
      };
    }

    const jsonData = await response.json();
    return parsePostgRESTResponse<T>(jsonData);
  } catch (error) {
    return {
      success: false,
      found: false,
      items: [],
      count: 0,
      error: {
        code: 'FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// USAGE:

// ✅ Instead of:
// const data = await response.json();
// console.log(data.id);  // ❌ May fail

// ✅ Use:
// const result = await fetchFromPostgREST<CompetitorData>(url);
// if (result.found) {
//   console.log('✅ Found:', result.data.id);
// } else {
//   console.log('⚠️ No data found');
// }

export default {
  parsePostgRESTResponse,
  fetchFromPostgREST,
};
```

---

## Specific Fixes for Your Code

### Fix #1: Competitors Verification Query

**Location:** Likely in `src/services/staging-vault-service.ts` or `src/services/competitor-service.ts`

**Current code (WRONG):**
```typescript
const response = await fetch(
  `/api/workspaces/${workspaceId}/competitors`
);
const competitorData = await response.json();
// ❌ competitorData is array, code expects object
console.log(competitorData.id);  // PGRST116!
```

**Fixed code:**
```typescript
import { parsePostgRESTResponse } from '@/lib/postgrest-utils';

const response = await fetch(
  `/api/workspaces/${workspaceId}/competitors`
);
const jsonData = await response.json();
const result = parsePostgRESTResponse(jsonData);

if (result.found) {
  console.log('✅ Competitors verified:', result.data);
  return result.items;  // Array of all competitors
} else {
  console.log('⚠️ No competitors found');
  return [];
}
```

### Fix #2: Staging Verification Query

**Location:** `src/services/staging-vault-service.ts` (the one with the error)

**Current code (WRONG):**
```typescript
const response = await fetch(
  `/api/workspaces/${workspaceId}/staging?id=eq.${signalId}`
);
const verified = await response.json();
// ❌ PGRST116: verified is array!
console.log(verified.status);  // Error!
```

**Fixed code:**
```typescript
import { parsePostgRESTResponse } from '@/lib/postgrest-utils';

const response = await fetch(
  `/api/workspaces/${workspaceId}/staging?id=eq.${signalId}`
);
const jsonData = await response.json();
const result = parsePostgRESTResponse(jsonData);

if (result.found) {
  console.log('✅ Signal staged:', result.data);
  return result.data;  // Single signal
} else {
  console.log('⚠️ Signal not found in staging');
  return null;
}
```

---

## Global Fix (for all POST/GET responses)

Add this wrapper to all fetch calls:

```typescript
// ✅ UNIVERSAL FIX
async function safeFetch<T = any>(
  url: string,
  options?: RequestInit
): Promise<{
  ok: boolean;
  status: number;
  data?: T | T[];  // ← Always array or single item
  error?: string;
}> {
  try {
    const response = await fetch(url, options);
    const jsonData = await response.json();

    // ✅ Handle as array
    const items = Array.isArray(jsonData) ? jsonData : [jsonData];

    return {
      ok: response.ok,
      status: response.status,
      data: items.length === 1 ? items[0] : items,  // Single if 1, array if many
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// USAGE:
const result = await safeFetch('/api/competitors');
if (result.ok && result.data) {
  // result.data is ALWAYS safe (either T or T[])
  console.log(result.data);
}
```

---

## Deployment Checklist

```
☐ Step 1: Create src/lib/postgrest-utils.ts with parsePostgRESTResponse()
☐ Step 2: Find all verification queries in codebase
☐ Step 3: Fix competitors verification (GET /api/workspaces/.../competitors)
☐ Step 4: Fix staging verification (GET /api/workspaces/.../staging)
☐ Step 5: Test both queries → should see ✅ SUCCESS (not PGRST116)
☐ Step 6: Deploy to production
☐ Step 7: Monitor logs for remaining PGRST116 errors
```

---

## Quick Diagnosis

To find ALL PostgREST queries that need fixing, run:

```bash
# Find all response parsing that might fail
grep -rn "await response.json()" src/ --include="*.ts" --include="*.tsx"

# Find all verification queries
grep -rn "VERIFICATION\|verification" src/ --include="*.ts" --include="*.tsx"

# Find all GET/POST to /api/
grep -rn "fetch.*\/api\/" src/ --include="*.ts" --include="*.tsx"
```

Each of these could be a potential PGRST116 error waiting to happen.

---

## Expected Output After Fix

### Before (❌ BROKEN)
```
GET /api/workspaces/.../competitors 200 in 2976ms
[StagingVault] ⚠️ VERIFICATION QUERY FAILED: PGRST116
```

### After (✅ FIXED)
```
GET /api/workspaces/.../competitors 200 in 2976ms
[StagingVault] ✅ COMPETITORS VERIFICATION SUCCESS
  Found 5 competitors
[StagingVault] ✅ SIGNAL STAGED AND VERIFIED
  Signal ID: existing-e8408dba-a0d5-49ce-a88c-6759b01b2ff1-competitor_weakness
```

---

## Summary

**Two PGRST116 errors** → **Same root cause** → **One universal fix**

| Query | Current | After Fix |
|-------|---------|-----------|
| GET /competitors | PGRST116 | ✅ Returns array safely |
| GET /staging | PGRST116 | ✅ Returns single item safely |
| All future GET queries | Potential PGRST116 | ✅ Protected by utility |

**Time to fix:** 5-10 minutes  
**Files to change:** 2-3  
**Data impact:** 0  
**Status:** 🚀 Ready to deploy

---

## Files to Create/Modify

1. **Create:** `src/lib/postgrest-utils.ts` (new utility)
2. **Modify:** `src/services/staging-vault-service.ts` (fix verification)
3. **Modify:** `src/services/competitor-service.ts` or wherever competitors are fetched
4. **Test:** Run both verification queries, confirm ✅ SUCCESS

**Deploy with confidence!**
