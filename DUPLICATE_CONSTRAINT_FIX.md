# ✅ Duplicate Constraint Fix - Upsert Strategy

## Problem
When analyzing the same competitor twice, the second attempt fails with:
```
Error 23505: duplicate key value violates unique constraint "idx_competitor_signal_isolation"
```

This is because the unique constraint on `(workspace_id, signal_type, language, competitor_id)` prevents inserting the same signal twice—which is actually correct behavior.

---

## Solution: Upsert (Insert or Update)

**File Updated:** `/src/lib/staging-vault/staging-vault-service.ts`

### What Changed

The `addSignalToVault()` function now implements a **two-step upsert strategy**:

1. **Try INSERT** - Normal case, first time analyzing a competitor
2. **If duplicate detected** (error code 23505) - Switch to UPDATE, replacing the old signal with new content

### Code Flow

```typescript
// Step 1: Attempt INSERT
const insertResult = await supabase.from("workspace_staging_vault").insert({
  workspace_id: workspaceId,
  signal_type: signalType,
  content: content.trim(),
  language,
  metadata: finalMetadata,  // ← competitor_id in here
  // ... other fields
});

// Step 2: If duplicate detected, UPDATE instead
if (error?.code === '23505') {
  const updateResult = await supabase
    .from("workspace_staging_vault")
    .update({ content, metadata, source, ... })
    .eq("workspace_id", workspaceId)
    .eq("signal_type", signalType)
    .eq("language", language)
    .eq("metadata->>'competitor_id'", competitorId)  // ← Find by competitor_id
    .select("id")
    .single();
}
```

### Key Details

**Unique Constraint Being Enforced:**
```sql
idx_competitor_signal_isolation ON (workspace_id, signal_type, language, metadata->>'competitor_id')
```

**Update Target:** 
Uses PostgreSQL `->>` operator to match on competitor_id inside the JSONB metadata field.

**Result:**
- ✅ First analyze: INSERT succeeds
- ✅ Second analyze (same competitor): UPDATE succeeds (replaces old data)
- ✅ Different competitor: INSERT succeeds

---

## Testing Steps

1. **Restart dev server:**
   ```bash
   npm run dev
   ```

2. **Analyze MyFitnessPal (1st time):**
   - Check terminal: Should see `method: 'INSERT'` in success log
   - Check DB: Should have 1 record with myfitnesspal data

3. **Analyze MyFitnessPal again (2nd time):**
   - Check terminal: Should see `method: 'UPSERT'` in success log
   - Check DB: Should still have 1 record (updated with latest data)

4. **Analyze a different competitor:**
   - Check terminal: Should see `method: 'INSERT'` in success log
   - Check DB: Should now have 2 records (one for each competitor)

---

## Expected Terminal Output

### First Analysis (INSERT)
```
[StagingVault] 🔍 ABOUT TO INSERT signal: {...}
[StagingVault] ✅ SUCCESS - Signal stored:
  method: 'INSERT'
  signalId: 'uuid-123'
  competitorId: 'com.myfitnesspal.android'
  language: 'en'
```

### Second Analysis (UPSERT → UPDATE)
```
[StagingVault] 🔄 DUPLICATE DETECTED - Attempting upsert (UPDATE):
  errorCode: '23505'
  competitorId: 'com.myfitnesspal.android'
[StagingVault] ✓ UPSERT succeeded (existing record updated):
  signalId: 'uuid-123'  ← Same ID as before
  competitorId: 'com.myfitnesspal.android'
```

---

## Error Handling

If the UPDATE fails for some reason:
```
[StagingVault] ❌ UPSERT UPDATE FAILED:
  errorCode: '...'
  errorMessage: '...'
```

This will throw the error to the client, which will show a toast: **"Failed to add to queue"**

---

## Next: Retrieval

Once insertion/updating works, the retrieval endpoint should find the data when you fetch staged keywords via:
```
GET /api/workspaces/[id]/competitors/[competitorId]/keywords?language=en
```

This queries the same unique constraint fields to find the most recent signal for that competitor/language combo.

---

## Summary

| Scenario | Result | Terminal Log |
|----------|--------|--------------|
| Analyze new competitor | ✅ INSERT | `method: 'INSERT'` |
| Analyze same competitor again | ✅ UPDATE | `method: 'UPSERT'` |
| Different language | ✅ INSERT | `method: 'INSERT'` |
| All other errors | ❌ Throws | Error logged |

The fix is **transparent to the UI**—users just see "Added to queue" whether it's a new insert or an update.
