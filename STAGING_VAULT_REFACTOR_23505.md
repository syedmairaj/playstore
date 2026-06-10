# Staging Vault Service Refactor: `.insert()` with 23505 Error Handling

## Overview

Replaced fragile `.upsert()` `onConflict` logic with simple `.insert()` and explicit PostgreSQL unique constraint (23505) error handling.

## Key Changes

### 1. Removed Delete-Then-Insert Pattern
- **Before:** Delete old signal → Insert new signal (race condition risk)
- **After:** Single atomic `.insert()` call with intelligent error handling

### 2. Explicit 23505 Error Handling
```typescript
if (error.code === "23505") {
  console.log("[StagingVaultService] ℹ️ SIGNAL ALREADY EXISTS (23505):", { ... });
  // Treat as success - signal is idempotent
  return { id: placeholderId, ... message: "...idempotent success" };
}
```

**PostgreSQL Error Code 23505 = `unique_violation`**
- Thrown when insert violates unique constraint `idx_competitor_signal_isolation`
- Constraint: `(workspace_id, metadata->>'competitor_id', language, signal_type) WHERE signal_type = 'competitor_weakness' AND deleted_at IS NULL`
- Treating 23505 as success makes the operation **idempotent** — calling it multiple times is safe

### 3. All Other Errors Thrown
```typescript
if (error.code !== "23505") {
  console.error("[StagingVaultService] ❌ INSERT FAILED:", { errorCode, ... });
  throw new Error(`Failed to add signal to vault: ${error.message} (${error.code})`);
}
```

Real errors (permissions, connection, syntax) are still raised and logged.

## Bilingual Support (EN/AR)

The `language` field is **critical** and part of both:
1. **Payload:** `language: "en" | "ar"` (explicit enum)
2. **Unique Constraint:** `(workspace_id, metadata->>'competitor_id', language, signal_type)`

This ensures:
- English ('en') and Arabic ('ar') signals for the **same competitor** are treated as **different rows**
- No collision between language variants
- Each language gets its own insert attempt and its own 23505 handling

Example:
```
INSERT competitor signal for MyFitnessPal (workspace_id=abc, competitor_id=mfp, language=en) → 23505
INSERT competitor signal for MyFitnessPal (workspace_id=abc, competitor_id=mfp, language=ar) → Success (different language)
```

## Simplified Flow

1. **Build record** with all fields including `language`
2. **Call `.insert()`** (no upsert, no onConflict)
3. **Check error:**
   - `error.code === "23505"` → Return success (idempotent)
   - `error.code !== "23505"` → Throw error
   - `!error` → Return inserted record with ID

## Console Logs

### Success (New Signal)
```
[StagingVaultService] ➕ INSERTING SIGNAL: { signalType, source, language, workspaceId }
[StagingVaultService] ✅ SIGNAL INSERTED: { signalId, signalType, source, language, createdAt }
```

### Success (Existing Signal - Idempotent)
```
[StagingVaultService] ➕ INSERTING SIGNAL: { signalType, source, language, workspaceId }
[StagingVaultService] ℹ️ SIGNAL ALREADY EXISTS (23505): { message: "Treating as success..." }
```

### Error (Real Failure)
```
[StagingVaultService] ➕ INSERTING SIGNAL: { signalType, source, language, workspaceId }
[StagingVaultService] ❌ INSERT FAILED: { errorCode, errorMessage, errorDetails, signalType }
```

## Why This Works

| Scenario | Before | After |
|----------|--------|-------|
| New signal | Insert succeeds | Insert succeeds ✅ |
| Signal exists | 23505 error (user sees 500) | 23505 handled, returns success ✅ |
| Race condition (2 inserts simultaneous) | Delete may fail or race | One succeeds, one gets 23505 → both return success ✅ |
| Permissions error | Delete/insert fails | Insert fails, throws immediately ✅ |
| Network error | Delete/insert fails | Insert fails, throws immediately ✅ |

## Deployment Checklist

- [x] Removed delete-then-insert pattern
- [x] Added explicit 23505 error code check
- [x] Bilingual `language` field preserved in payload and constraint
- [x] Non-23505 errors still throw
- [x] Console logging updated with new flow
- [x] Idempotent behavior: calling multiple times is safe

## Testing

Test clicking "Send to AI Optimizer" **multiple times** for the same competitor:
1. First click → `✅ SIGNAL INSERTED` (new record created)
2. Second click → `ℹ️ SIGNAL ALREADY EXISTS (23505)` (treated as success, idempotent)
3. Both return `{ success: true }` to the frontend
4. No 500 errors, no constraint violations exposed to user

## Files Modified

- `src/lib/staging-vault/staging-vault-service.ts`

## Related Database Constraint

```sql
CREATE UNIQUE INDEX idx_competitor_signal_isolation
  ON workspace_staging_vault (
    workspace_id,
    (metadata->>'competitor_id'),
    language,
    signal_type
  )
  WHERE signal_type = 'competitor_weakness' AND deleted_at IS NULL;
```

This constraint ensures uniqueness. Our 23505 handling respects it gracefully.
