# Quick Fix: PostgREST PGRST116 Errors

**Two errors you're seeing:**
1. `GET /api/competitors` → PGRST116
2. `POST /api/staging/add` → PGRST116

**Fix:** 3-step implementation

---

## Step 1: Add Utility (1 min)

Copy this to your project:
- `src/lib/postgrest-utils.ts` (already created for you)

---

## Step 2: Find Your Verification Code (2 min)

Search your codebase for:

```bash
# Find the competitors verification
grep -r "competitors" src/ --include="*.ts" --include="*.tsx"

# Find the staging verification  
grep -r "staging" src/ --include="*.ts" --include="*.tsx"
```

You should find something like:

```typescript
// ❌ WRONG (This is failing with PGRST116)
const response = await fetch('/api/workspaces/.../competitors');
const data = await response.json();
// Use data as single object → ERROR!
```

---

## Step 3: Replace with Utility Call (1 min)

**Replace this:**
```typescript
const response = await fetch('/api/workspaces/.../competitors');
const data = await response.json();
// Use data.something...
```

**With this:**
```typescript
import { fetchFromPostgREST } from '@/lib/postgrest-utils';

const result = await fetchFromPostgREST('/api/workspaces/.../competitors');
if (result.found) {
  // ✅ Use result.data (single item) or result.items (all items)
  console.log('✅ Found:', result.data);
} else {
  console.log('⚠️ No data found');
}
```

---

## Complete Examples

### Example 1: Competitors Verification

**BEFORE (BROKEN):**
```typescript
const response = await fetch(
  `/api/workspaces/${workspaceId}/competitors`
);
const competitors = await response.json();
console.log(competitors[0].name);  // ❌ PGRST116!
```

**AFTER (FIXED):**
```typescript
import { fetchFromPostgREST } from '@/lib/postgrest-utils';

const result = await fetchFromPostgREST(
  `/api/workspaces/${workspaceId}/competitors`
);

if (result.found) {
  console.log('✅ Competitors:', result.items);
  console.log('First competitor:', result.data?.name);
} else {
  console.log('⚠️ No competitors found');
}
```

### Example 2: Staging Verification

**BEFORE (BROKEN):**
```typescript
const response = await fetch(
  `/api/workspaces/${workspaceId}/staging?id=eq.${signalId}`
);
const verified = await response.json();
if (verified.status) {  // ❌ PGRST116!
  console.log('Verified');
}
```

**AFTER (FIXED):**
```typescript
import { fetchFromPostgREST } from '@/lib/postgrest-utils';

const result = await fetchFromPostgREST(
  `/api/workspaces/${workspaceId}/staging?id=eq.${signalId}`
);

if (result.found) {
  console.log('✅ Verified:', result.data);
} else {
  console.log('⚠️ Not found');
}
```

### Example 3: Verify Then Return Data

```typescript
import { verifyInDatabase } from '@/lib/postgrest-utils';

// Simple: verify and get first item
const verified = await verifyInDatabase(
  `/api/workspaces/${workspaceId}/staging?id=eq.${signalId}`,
  {
    headers: {
      'Authorization': `Bearer ${authToken}`,
    },
  }
);

if (verified) {
  console.log('✅ Verification SUCCESS:', verified);
  return verified;
} else {
  console.log('⚠️ Verification failed: not found');
  return null;
}
```

### Example 4: Get All Items

```typescript
import { getAll } from '@/lib/postgrest-utils';

// Get all competitors
const allCompetitors = await getAll(
  `/api/workspaces/${workspaceId}/competitors`
);

console.log(`Found ${allCompetitors.length} competitors`);
```

---

## Utility Functions Available

| Function | Returns | Use Case |
|----------|---------|----------|
| `fetchFromPostgREST<T>()` | `PostgRESTResponse<T>` | Main function, handles all queries |
| `verifyInDatabase<T>()` | `T \| null` | Check if data exists |
| `getAll<T>()` | `T[]` | Get all items |
| `getFirst<T>()` | `T \| null` | Get single item |
| `fetchBatch<T>()` | `PostgRESTResponse<T>[]` | Multiple queries in parallel |
| `toArray<T>()` | `T[]` | Convert response to array |
| `toSingle<T>()` | `T \| null` | Convert response to single item |
| `safeFetch<T>()` | `{ok, status, data, error}` | Simple wrapper version |

---

## Expected Output

### Before (BROKEN)
```
GET /api/workspaces/.../competitors 200 in 2976ms
[StagingVault] ⚠️ VERIFICATION QUERY FAILED: PGRST116
  errorMessage: 'Cannot coerce the result to a single JSON object'
```

### After (FIXED)
```
GET /api/workspaces/.../competitors 200 in 2976ms
[PostgRESTUtils] ✅ Success:
  found: true
  count: 5
[StagingVault] ✅ VERIFICATION SUCCESS
  Found 5 competitors
```

---

## Time Estimate

- **Copy utility:** 1 min (already done for you)
- **Find verification code:** 2 min
- **Replace with utility:** 1 min
- **Test:** 1 min
- **Total:** ~5 minutes

---

## Files to Update

Based on your error messages, update these files:

1. **`src/services/staging-vault-service.ts`**
   - Find: `verifySignalStaged()` function
   - Fix: Use `fetchFromPostgREST()` instead of manual fetch

2. **`src/services/competitor-service.ts`** (or wherever competitors are fetched)
   - Find: Code fetching `/api/competitors`
   - Fix: Use `fetchFromPostgREST()` instead of manual fetch

---

## Deployment

```bash
# 1. Add utility
cp src/lib/postgrest-utils.ts <your-project>/src/lib/

# 2. Update services
# Edit staging-vault-service.ts - replace verification logic
# Edit competitor-service.ts - replace fetch logic

# 3. Test
npm test
# or manually test the two endpoints

# 4. Deploy
git add .
git commit -m "fix: handle PostgREST array responses to fix PGRST116"
git push
```

---

## Validation

After applying the fix, you should see:

✅ `[PostgRESTUtils] ✅ Success` messages  
✅ No more PGRST116 errors  
✅ Both verification queries working  
✅ Data being saved and verified correctly  

---

## Still Getting Errors?

**Check 1:** Did you import the utility?
```typescript
import { fetchFromPostgREST } from '@/lib/postgrest-utils';
```

**Check 2:** Are you using the returned result correctly?
```typescript
// ✅ CORRECT
const result = await fetchFromPostgREST(...);
if (result.found) {
  console.log(result.data);  // Use result.data
}

// ❌ WRONG
const result = await fetchFromPostgREST(...);
console.log(result.id);  // result is PostgRESTResponse, not T!
```

**Check 3:** Is the endpoint URL correct?
```typescript
// Make sure URL is complete
const result = await fetchFromPostgREST(
  `/api/workspaces/${workspaceId}/competitors`  // ✅ Has workspaceId
);
```

---

**Status:** 🚀 Ready to deploy!

All PGRST116 errors should be fixed with these 3 steps.
