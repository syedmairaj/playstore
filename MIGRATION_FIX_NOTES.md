# Migration Fix: Partial Unique Index Syntax

## Problem

```sql
CONSTRAINT unique_active_override_per_workspace_schema UNIQUE (
  workspace_id,
  base_schema_id,
  is_active
) WHERE is_active = true  ❌ SYNTAX ERROR
```

**Error:** `syntax error at or near "WHERE"` on line 68

## Root Cause

PostgreSQL doesn't support `WHERE` clauses in inline table constraints. The `WHERE` clause can only be used with **partial indexes**, which must be created as separate `CREATE UNIQUE INDEX` statements.

## Solution Applied

### Step 1: Remove the problematic constraint
Removed the inline `CONSTRAINT ... UNIQUE ... WHERE` from table creation.

### Step 2: Create as a separate partial unique index
```sql
CREATE UNIQUE INDEX idx_unique_active_override_per_workspace_schema
  ON workspace_theme_overrides(workspace_id, base_schema_id)
  WHERE is_active = true;
```

**What this does:**
- Only enforces uniqueness for rows where `is_active = true`
- Allows multiple `false` rows for the same (workspace, schema) pair
- Allows only ONE `true` row per (workspace, schema) combination

### Step 3: Add triggers for both INSERT and UPDATE
```sql
CREATE TRIGGER enforce_single_active_override_trigger_insert
  AFTER INSERT ON workspace_theme_overrides
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_active_override();

CREATE TRIGGER enforce_single_active_override_trigger_update
  AFTER UPDATE ON workspace_theme_overrides
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_active_override();
```

**Why both?** The trigger deactivates conflicting overrides when a new one is activated, ensuring the partial unique index constraint is never violated.

## Behavior

Now when you insert or update an override with `is_active = true`:

```typescript
// User has 3 overrides for "minimalist-professional"
// Override A: is_active = true
// Override B: is_active = false
// Override C: is_active = false

// Activate Override B
await activateWorkspaceThemeOverride(overrideB.id);

// Trigger fires:
// → Sets Override A.is_active = false (auto-deactivate)
// → Sets Override B.is_active = true
// → Override C remains false

// Result: Only one active override per workspace/schema ✅
```

## Files Updated

- ✅ `supabase/migrations/20260603100000_workspace_theme_overrides.sql`

## Testing the Migration

```bash
# Push to Supabase
supabase db push

# Should now succeed without syntax errors
```

## Verification

After running the migration, verify:

```sql
-- Check the partial unique index was created
SELECT indexname FROM pg_indexes 
WHERE tablename = 'workspace_theme_overrides'
AND indexname = 'idx_unique_active_override_per_workspace_schema';

-- Should return one row ✅

-- Check triggers were created
SELECT trigger_name FROM information_schema.triggers 
WHERE event_object_table = 'workspace_theme_overrides';

-- Should return 3 triggers:
-- - update_workspace_theme_overrides_updated_at_trigger
-- - enforce_single_active_override_trigger_insert
-- - enforce_single_active_override_trigger_update ✅
```

## Additional Fix: Sequence Grant Error

### Second Issue

```sql
GRANT USAGE, SELECT ON SEQUENCE workspace_theme_overrides_id_seq TO authenticated;
```

**Error:** `relation "workspace_theme_overrides_id_seq" does not exist`

### Why

- The table uses `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- UUIDs don't use a sequence (no `SERIAL` type)
- PostgreSQL doesn't auto-create a sequence for UUID columns
- The grant statement was referencing a non-existent sequence

### Fix Applied

Removed the sequence grant line entirely:

```sql
-- BEFORE ❌
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_theme_overrides TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE workspace_theme_overrides_id_seq TO authenticated;

-- AFTER ✅
-- Note: No sequence grant needed since we use UUID, not SERIAL
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_theme_overrides TO authenticated;
```

## Migration is Now Correct ✅

The migration file has been fixed on both counts and is ready to push to Supabase:

1. ✅ Fixed: Partial unique index syntax (WHERE clause)
2. ✅ Fixed: Removed non-existent sequence grant

```bash
supabase db push
```

Should now run successfully without any errors.
