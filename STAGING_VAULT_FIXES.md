# Staging Vault Fixes: Complete Guide

## Problem Summary

You were getting `42P01: relation 'staging_vault' does not exist` error when trying to create the unique index.

## Root Cause Analysis

1. **Missing Schema Prefix:** The error message referenced `staging_vault` but the actual table is `workspace_staging_vault`
2. **Index Definition Missing `deleted_at` Condition:** The index tried to enforce uniqueness on deleted rows too, causing conflicts
3. **Metadata Structure:** The table requires `competitor_id` to be explicitly in the JSONB metadata column

## Solution Implemented

### 1. Correct SQL Query to List All Staging Tables

```sql
SELECT tablename, schemaname 
FROM pg_tables 
WHERE tablename LIKE '%staging%' 
ORDER BY schemaname, tablename;
```

This shows all staging-related tables. In your case, you should see:
- `workspace_staging_vault` (schema: `public`)

### 2. Corrected SQL Migration

**File:** `/migrations/001_create_competitor_isolation_index.sql`

```sql
-- Create the compound unique index for competitor signal isolation
-- CRITICAL: Exclude deleted_at IS NOT NULL so soft-deleted signals don't block new ones
CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_signal_isolation
  ON workspace_staging_vault (
    workspace_id,
    (metadata->>'competitor_id'),  -- Extract competitor_id from JSONB metadata
    language,
    signal_type
  )
  WHERE signal_type = 'competitor_weakness' AND deleted_at IS NULL;
```

**Key Differences:**
- ✅ No `public.` prefix needed - table is in default public schema
- ✅ Added `AND deleted_at IS NULL` - soft-deleted signals don't block new ones
- ✅ Correctly extracts `competitor_id` from JSONB using `->>` operator

### 3. Updated TypeScript Service

**File:** `src/lib/staging-vault/staging-vault-service.ts`

**Key Change:** Explicitly include `competitor_id` in metadata during upsert:

```typescript
metadata: {
  ...metadata,
  competitor_id: competitorId,  // ← CRITICAL: Must be in metadata
  keywords: keywords || [],
  signal_created_at: now,
},
```

This ensures the JSONB column has the exact field that the unique index uses for matching.

## How It Works Now

### Upsert Flow (Atomic)

1. **Insert Request Arrives:** User clicks "Send to AI Optimizer" for MyFitnessPal competitor
2. **Service Checks:** Is this a `competitor_weakness` signal?
3. **Upsert Executes:** 
   ```
   INSERT INTO workspace_staging_vault (...) 
   ON CONFLICT(workspace_id, (metadata->>'competitor_id'), language, signal_type)
   DO UPDATE SET content = ..., metadata = ...
   ```
4. **Result:** 
   - If no matching signal exists → **INSERT** succeeds
   - If matching signal exists → **UPDATE** replaces it atomically
   - No race conditions, no duplicate key errors

### Why Soft Delete Matters

The index has `WHERE deleted_at IS NULL` because:

✅ Soft-deleted signals don't prevent new ones (historical audit trail preserved)
✅ Users can "undelete" signals if needed
✅ Multiple UPSERT calls with same competitor don't collide

## Deployment Checklist

- [ ] Run the corrected SQL migration in Supabase SQL Editor
- [ ] Verify index exists: `SELECT indexname FROM pg_indexes WHERE indexname = 'idx_competitor_signal_isolation'`
- [ ] Test clicking "Send to AI Optimizer" twice for same competitor (should work now)
- [ ] Check console logs for: `✅ SIGNAL UPSERTED`
- [ ] Verify no 500 errors in API response

## Console Logs to Expect

On success:
```
[StagingVaultService] 🔄 UPSERTING COMPETITOR SIGNAL
[StagingVaultService] ✅ SIGNAL UPSERTED: signalId: <uuid>
POST /api/workspaces/.../staging/add 200
```

## Why This Happens (Technical Explanation)

**Schema Differences:**
- Supabase migrations create tables without explicit `public.` schema prefix (it's default)
- Queries don't need `public.` prefix either when using default schema
- The migration file reference to non-existent `staging_vault` caused the "relation does not exist" error

**Case Sensitivity:**
- PostgreSQL table names are case-insensitive by default
- `workspace_staging_vault` ≠ `staging_vault` (different names, not case difference)

**Unique Index with Soft Delete:**
- Standard unique indexes would block ALL signals with same competitor, including deleted ones
- Adding `WHERE deleted_at IS NULL` makes the index "partial" - only active rows are constrained
- This enables soft-delete patterns while maintaining uniqueness enforcement

## Next Steps

1. Run the SQL migration
2. Test duplicate sends (should now use UPSERT atomically)
3. Verify Optimizer component receives updated keywords
4. Monitor for any 500 errors in production

---

**Status:** ✅ Ready for deployment
**Files Modified:** 
- `migrations/001_create_competitor_isolation_index.sql`
- `src/lib/staging-vault/staging-vault-service.ts`
