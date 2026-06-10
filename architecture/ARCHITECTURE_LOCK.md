# 🔒 ARCHITECTURE LOCK - BINDING REFERENCE
## Competitor Keywords Routing & Staging Vault System

**Status:** LOCKED FOR PRODUCTION  
**Locked By:** dash (dashingglint@gmail.com)  
**Date:** 2026-06-09  
**Effective:** All current and future development

---

## 🛑 CRITICAL: READ BEFORE ANY CODE CHANGES

This document defines the **canonical architecture** for the entire Competitor Keywords routing system and Staging Vault. **All future changes MUST adhere to these constraints.** Deviations require explicit architectural review and sign-off.

**On every new chat session:** Read this document first before making ANY changes to related files.

---

## The Four Immutable Constraints

### ✅ CONSTRAINT #1: Schema Consistency
**Definition:** All signal additions must target `public.workspace_staging_vault` using the same JSONB metadata structure.

**Locked Implementation:**
- Signals go to `workspace_staging_vault` table (not new tables)
- Metadata is stored in existing `metadata` JSONB column
- New fields added to metadata MUST be within the JSONB object, NOT as new table columns
- Schema changes are FORBIDDEN unless explicitly approved by architectural review

**Metadata Structure (Locked):**
```json
{
  "competitor_id": "com.fittrack.pro",
  "competitor_name": "FitTrack Pro",
  "category_label": "Health & Fitness",
  "language": "en",
  "keywords_by_strategy": {
    "high_volume": [...],
    "intent_based": [...],
    "competitor_gap": [...]
  },
  "vulnerabilities": [...],
  "is_rtl": false,
  "category": "competitor_keyword",
  "signal_created_at": "2026-06-09T...",
  "[future_field]": "value"
}
```

**Verification Checklist:**
- [ ] No new columns added to `workspace_staging_vault`
- [ ] All new data stored within `metadata` JSONB
- [ ] Backward compatibility maintained (old signals still work)
- [ ] `JSON.stringify(metadata)` succeeds without errors

**Files That Must Respect This:**
- `src/lib/staging-vault/staging-vault-service.ts` (storage logic)
- `src/lib/competitor-spy/capture-and-stage-keywords.ts` (payload preparation)
- Any new signal capture code

---

### ✅ CONSTRAINT #2: Unique Constraint Enforcement
**Definition:** The unique index `idx_competitor_signal_isolation` on (workspace_id, competitor_id, language, signal_type) must be maintained and respected.

**Locked Implementation:**
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

**This Means:**
- Each competitor has exactly ONE active signal per (language, workspace, signal_type)
- New fields (like `category`) MUST NOT be added to the uniqueness key
- 23505 errors (duplicate key violations) MUST be treated as idempotent success (no-op)
- Upsert logic MUST match on isolation key fields only, not new fields

**Error Handling Pattern (Locked):**
```typescript
if (error?.code === '23505') {
  console.log('Signal already exists - treating as idempotent success');
  return {
    id: placeholderId,
    workspaceId,
    signalType,
    message: `Signal already exists (${keywords?.length} keywords) - idempotent`,
    createdAt: now,
  };
  // Do NOT throw error
  // Do NOT switch to UPDATE
}
```

**Why This Matters:**
- Guarantees users can send same competitor multiple times without 500 errors
- Enables atomic competitor switching (old A data isolated, new B data inserts cleanly)
- Prevents data collision when users switch between competitors

**Files That Must Respect This:**
- `src/lib/staging-vault/staging-vault-service.ts` (error handling in addSignalToVault)
- Any new INSERT/UPSERT logic

**Files That MUST NEVER CHANGE:**
- `migrations/001_create_competitor_isolation_index.sql` (the index definition)
- `supabase/migrations/20260604100100_workspace_staging_vault.sql` (table definition)

---

### ✅ CONSTRAINT #3: Category-Based Routing
**Definition:** The `category` field must route signals to correct Optimizer buckets (High-Volume, Intent-Based, Competitor Gap, etc.).

**Locked Implementation:**
- **Capture Layer:** `capture-and-stage-keywords.ts` sets `category: 'competitor_keyword'`
- **Transport Layer:** `/api/workspaces/.../staging/add` validates via Zod schema
- **Storage Layer:** `staging-vault-service.ts` preserves category in metadata
- **Retrieval Layer:** Already extracts from metadata (no changes needed)
- **Display Layer:** Already color-codes by category (no changes needed)

**Category Values (Locked):**
```typescript
type ValidCategory = 
  | 'competitor_keyword'      // From Competitor Spy
  | 'high_volume'             // From Market Intelligence
  | 'intent_based'            // From Keyword Research
  | 'market_opportunity'      // From Market Analysis
  | 'user_generated'          // From manual input
```

**Routing Map (Locked):**
| Category | Optimizer Bucket | Color | Source |
|----------|------------------|-------|--------|
| `competitor_keyword` | Competitor Keywords | accent | Competitor Spy |
| `high_volume` | High-Volume Keywords | primary | Market Intelligence |
| `intent_based` | Intent-Based Keywords | secondary | Keyword Research |
| `market_opportunity` | Market Opportunities | highlight | Market Analysis |
| `user_generated` | User Suggestions | default | Manual Input |

**Full Category Pipeline (Locked):**
```
1. CAPTURE (capture-and-stage-keywords.ts)
   requestPayload = { category: 'competitor_keyword', ... }

2. VALIDATE (staging/add/route.ts)
   bodySchema = { category: z.string().optional(), ... }

3. STORE (staging-vault-service.ts)
   finalMetadata.category = signal.category
   INSERT into workspace_staging_vault

4. RETRIEVE (already working)
   SELECT * WHERE workspace_id = ? AND deleted_at IS NULL

5. EXTRACT (already working)
   keywords = metadata.keywords[]
   category = metadata.category

6. DISPLAY (already working)
   <Badge category={keyword.category}>{keyword.term}</Badge>
```

**Verification Checklist:**
- [ ] Category added at capture layer (capture-and-stage-keywords.ts)
- [ ] Category validated in API schema (staging/add/route.ts)
- [ ] Category preserved in metadata storage (staging-vault-service.ts)
- [ ] Category extracted in display logic (optimizer-keywords-display.ts)
- [ ] Keywords appear in correct Optimizer bucket
- [ ] Category matches Optimizer's bucket definitions

**Files That Must Respect This:**
- `src/lib/competitor-spy/capture-and-stage-keywords.ts` (SET category here)
- `app/api/workspaces/[workspaceId]/staging/add/route.ts` (VALIDATE category)
- `src/lib/staging-vault/staging-vault-service.ts` (PRESERVE category)
- `src/components/optimizer/ActiveContextKeywords.tsx` (DISPLAY by category)
- `src/lib/client/optimizer-keywords-display.ts` (EXTRACT category)

---

### ✅ CONSTRAINT #4: Atomic Operations
**Definition:** Deletion logic must act on the unique `id` (UUID primary key) to prevent accidental removal of other signals.

**Locked Implementation:**
```typescript
// DELETE pattern (locked)
const { error } = await supabase
  .from('workspace_staging_vault')
  .update({ deleted_at: now(), deleted_by_user_id: userId })
  .eq('id', signalId)           // ← Scoped to unique UUID
  .eq('workspace_id', workspaceId)  // ← Workspace boundary
```

**RLS Policy (Locked):**
```sql
CREATE POLICY staging_vault_delete ON workspace_staging_vault FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    ) AND created_by_user_id = auth.uid()  -- ← User ownership required
  );
```

**This Means:**
- **Soft delete only:** Set `deleted_at`, never hard delete
- **Scoped to UUID:** Always include `.eq('id', signalId)` in delete query
- **Workspace boundary:** Always include `.eq('workspace_id', workspaceId)`
- **User ownership:** RLS policy enforces `created_by_user_id = auth.uid()`
- **No cascading deletes:** Never delete by composite key or foreign key

**Why This Matters:**
- Prevents accidental deletion of other keywords in same workspace
- Maintains audit trail (deleted_at records who deleted what and when)
- Prevents race conditions (UUID is globally unique)
- RLS prevents users from deleting other users' signals

**Delete Pattern (Locked):**
```typescript
// CORRECT ✅
await supabase
  .from('workspace_staging_vault')
  .update({ deleted_at: now(), deleted_by_user_id: userId })
  .eq('id', signalId)                    // ← Primary key only
  .eq('workspace_id', workspaceId);      // ← Boundary

// WRONG ❌ (would affect multiple signals)
await supabase
  .from('workspace_staging_vault')
  .delete()
  .eq('workspace_id', workspaceId)
  .eq('metadata->competitor_id', 'com.fittrack.pro');

// WRONG ❌ (hard delete loses audit trail)
await supabase
  .from('workspace_staging_vault')
  .delete()
  .eq('id', signalId);
```

**Verification Checklist:**
- [ ] All deletes use soft delete (deleted_at, not hard delete)
- [ ] All deletes scoped to `.eq('id', UUID)`
- [ ] All deletes include `.eq('workspace_id', workspaceId)`
- [ ] RLS policy enforced in database
- [ ] deleted_by_user_id recorded with deletion
- [ ] Audit trail maintained

**Files That Must Respect This:**
- `src/lib/staging-vault/staging-vault-service.ts` (delete functions)
- `app/api/workspaces/[workspaceId]/staging/delete/route.ts` (API delete endpoint)
- Any new deletion/removal logic

---

## Current Implementation Status (Locked)

### Files Modified ✅
```
✅ src/lib/competitor-spy/capture-and-stage-keywords.ts
   Change: Added category: 'competitor_keyword' to requestPayload (line 283)
   Status: LOCKED

✅ app/api/workspaces/[workspaceId]/staging/add/route.ts
   Change: Added category: z.string().optional() to schema (line 36)
   Status: LOCKED

✅ src/lib/staging-vault/staging-vault-service.ts
   Change: Added category support to AddSignalPayload and metadata storage (lines 24, 50, 69-72)
   Status: LOCKED
```

### Files Verified (No Changes Needed) ✅
```
✅ src/components/optimizer/ActiveContextKeywords.tsx
   Status: Already supports category-based display
   
✅ src/lib/client/optimizer-keywords-display.ts
   Status: Already extracts category from metadata
   
✅ supabase/migrations/20260604100100_workspace_staging_vault.sql
   Status: Schema supports JSONB metadata (no migration needed)
   
✅ migrations/001_create_competitor_isolation_index.sql
   Status: Unique index unchanged and working
```

---

## How to Use This Document

### When Starting New Work
1. **Read this entire document** before writing any code
2. **Check which constraint** your change affects
3. **Verify the locked implementation** matches what's required
4. **Run verification checklist** before committing

### When Adding New Features
1. Identify which constraint applies
2. Review the "Locked Implementation" section
3. Follow the pattern exactly
4. Update the "Current Implementation Status" section (add files modified)
5. Keep this document as the single source of truth

### When Fixing Bugs
1. Ensure fix respects all four constraints
2. Don't change architecture to work around bugs
3. If architecture needs adjustment, document it here (with sign-off)
4. Test that all verification checklists pass

### When Writing Tests
- Test that 23505 errors are handled gracefully (Constraint #2)
- Test that category field routes correctly (Constraint #3)
- Test that deletes only affect target signal (Constraint #4)
- Test that metadata JSONB structure is preserved (Constraint #1)

---

## Architectural Review Checklist (Before Committing)

Use this before every commit to related files:

```markdown
## Pre-Commit Architectural Review

- [ ] Read ARCHITECTURE_LOCK.md in full
- [ ] Identified which constraint(s) this change affects
- [ ] Verified implementation matches locked pattern
- [ ] No new table columns added (Constraint #1)
- [ ] Unique constraint still enforced (Constraint #2)
- [ ] Category field flows end-to-end (Constraint #3)
- [ ] Deletes scoped to UUID primary key (Constraint #4)
- [ ] Updated ARCHITECTURE_LOCK.md with new status
- [ ] All verification checklists pass
- [ ] No schema migrations needed (or approved separately)
- [ ] Tested with real competitor data
- [ ] Verified bilingual/RTL support still works
```

---

## Files to Always Check Together

When making changes to competitor keywords routing:

```
capture-and-stage-keywords.ts
    ↓ (sets category)
staging/add/route.ts
    ↓ (validates category)
staging-vault-service.ts
    ↓ (stores category in metadata)
workspace_staging_vault (database)
    ↓ (queries keywords)
optimizer-keywords-display.ts
    ↓ (extracts category from metadata)
ActiveContextKeywords.tsx
    ↓ (displays by category)
User sees keywords in correct bucket
```

**Never modify just one file.** These form an interdependent pipeline.

---

## What Changes are Allowed

✅ **ALLOWED** (Respect all 4 constraints):
- Adding new `category` values (update the Category Values table)
- Adding new signal sources (update signal_source enum)
- Improving display (color, icons, sorting)
- Enhancing metadata with new fields (add to JSONB)
- Bug fixes that respect constraints
- Optimizing queries
- Adding tests
- Improving error messages

❌ **FORBIDDEN** (Violate constraints):
- Adding new columns to `workspace_staging_vault` (use metadata instead)
- Removing or modifying `idx_competitor_signal_isolation` index
- Changing 23505 error handling (throwing instead of graceful no-op)
- Hard deleting signals (always soft delete)
- Using composite keys for deletion (always use `id` UUID)
- Storing category outside of metadata
- Upsert logic that matches on `category` (use isolation key only)

---

## Future Update Process

When future improvements are needed:

1. **Document the change** in this file
2. **Mark the section** as "[UPDATED: YYYY-MM-DD]"
3. **Explain why** the constraint or implementation changed
4. **Verify backward compatibility** - old signals must still work
5. **Update verification checklists** if needed
6. **Keep this document as the source of truth** for all future work

**Example:**
```markdown
### ✅ CONSTRAINT #3: Category-Based Routing [UPDATED: 2026-06-15]
**Previous:** Only 'competitor_keyword' supported
**Current:** Added support for dynamic category values from API
**Why:** Enable other modules to use staging vault with their own categories
**Backward Compatibility:** Old 'competitor_keyword' still routes correctly
```

---

## Emergency Break Glass

If an urgent fix violates this architecture:

1. **Document the violation** in ARCHITECTURE_LOCK.md
2. **Mark it [TEMPORARY FIX]** with date
3. **Explain why** it was necessary
4. **Plan the proper fix** and target date
5. **Never leave temporary fixes in production**

Example:
```markdown
[TEMPORARY FIX: 2026-06-10] Hard delete in cleanup endpoint
Reason: Performance issue with soft deletes on large datasets
Planned proper fix: Archival table + TTL cleanup (target: 2026-06-30)
Risk: May prevent audit trail recovery - do not use in customer-facing deletion
```

---

## Summary

This architecture is **LOCKED** because it provides:

✅ **Schema Safety** - JSONB metadata prevents schema thrashing  
✅ **Data Integrity** - Unique constraint prevents duplicates and collisions  
✅ **Correct Routing** - Category field flows end-to-end  
✅ **Safe Deletion** - Atomic operations scoped to UUID  

**On every new chat:** Start by reading this document.  
**On every code change:** Verify against all four constraints.  
**On every commit:** Run the pre-commit checklist.  

**This is not negotiable.** Deviations require explicit approval and documentation.

---

**Locked by:** dash (dashingglint@gmail.com)  
**Lock Date:** 2026-06-09  
**Last Updated:** 2026-06-09  
**Status:** ACTIVE & BINDING
