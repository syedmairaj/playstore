# ⚡ Quick Reference - Architecture Lock
## One-Page Cheat Sheet

**READ FULL LOCK:** `ARCHITECTURE_LOCK.md`

---

## The 4 Immutable Constraints

| # | Constraint | Lock Type | Key Principle |
|---|-----------|-----------|---------------|
| 1️⃣ | **Schema Consistency** | Use JSONB metadata only (no new columns) | All new data → metadata object |
| 2️⃣ | **Unique Constraint** | `idx_competitor_signal_isolation` enforced | 23505 = idempotent success (not error) |
| 3️⃣ | **Category-Based Routing** | Category flows end-to-end | capture → validate → store → display |
| 4️⃣ | **Atomic Operations** | Delete via UUID primary key | Always `.eq('id', uuid)` + soft delete |

---

## Before Every Code Change

```
1. Which constraint does this affect? (1, 2, 3, or 4)
2. Does my implementation match the locked pattern?
3. Did I add any new columns? (NO!)
4. Did I change error handling? (NO!)
5. Does category flow end-to-end? (YES!)
6. Did I delete by UUID only? (YES!)
```

---

## The Golden Pipeline

```
CAPTURE:     category: 'competitor_keyword'  (add here)
VALIDATE:    category: z.string().optional() (add here)
STORE:       finalMetadata.category = cat    (add here)
RETRIEVE:    Already works ✅
EXTRACT:     Already works ✅
DISPLAY:     Already works ✅
```

---

## Metadata Structure (Locked)

```json
{
  "competitor_id": "com.fittrack.pro",
  "competitor_name": "FitTrack Pro",
  "language": "en",
  "category": "competitor_keyword",
  "[new_fields_go_here]": "value"
}
```

**NO EXCEPTIONS:** New data → inside metadata JSONB object

---

## Delete Pattern (Locked)

```typescript
// ✅ CORRECT
await supabase
  .from('workspace_staging_vault')
  .update({ deleted_at: now() })
  .eq('id', signalId)              // ← UUID only
  .eq('workspace_id', workspaceId);

// ❌ WRONG (affects multiple signals)
.delete()
.eq('workspace_id', workspaceId)
.eq('metadata->competitor_id', 'x');
```

---

## 23505 Error Handling (Locked)

```typescript
// ✅ CORRECT (Idempotent)
if (error?.code === '23505') {
  return { success: true, message: 'Already exists' };
}

// ❌ WRONG (Throws error)
if (error?.code === '23505') {
  throw new Error('Duplicate!');
}
```

---

## Files in the Pipeline

```
capture-and-stage-keywords.ts    ← Add category HERE
staging/add/route.ts             ← Validate category HERE
staging-vault-service.ts         ← Store category HERE
ActiveContextKeywords.tsx         ← Display (already works)
optimizer-keywords-display.ts    ← Extract (already works)
workspace_staging_vault          ← Schema (never change)
idx_competitor_signal_isolation  ← Index (never change)
```

**Change only the first 3.** Others already work.

---

## Category Values

| Value | Bucket | Source |
|-------|--------|--------|
| `competitor_keyword` | Competitor Keywords | Competitor Spy |
| `high_volume` | High-Volume Keywords | Market Intelligence |
| `intent_based` | Intent-Based Keywords | Keyword Research |
| `market_opportunity` | Market Opportunities | Market Analysis |

---

## Verification Checklist

Before every commit:

```
✅ Read ARCHITECTURE_LOCK.md fully
✅ No new columns added to workspace_staging_vault
✅ Category preserved in metadata (not separate column)
✅ 23505 handled as idempotent success
✅ Deletes scoped to UUID primary key
✅ Category flows: capture → validate → store → display
✅ Tested with real competitor data
✅ Bilingual/RTL still works
```

---

## Allowed Changes ✅

- Add new category values
- Improve display (colors, sorting, icons)
- Add new metadata fields (inside JSONB)
- Bug fixes (respecting constraints)
- Optimize queries
- Add tests
- Improve error messages

---

## Forbidden Changes ❌

- Add columns to `workspace_staging_vault`
- Remove/modify `idx_competitor_signal_isolation` index
- Throw error on 23505 (must be graceful)
- Hard delete signals (always soft delete)
- Delete by composite key (always use UUID)
- Store category outside metadata
- Upsert that matches on category (use isolation key only)

---

## When Starting New Chat

```
1. Read ARCHITECTURE_LOCK.md completely
2. Understand the 4 constraints
3. Reference this quick card for patterns
4. Never deviate without documented reason
```

---

## Locked: 2026-06-09 | Status: ACTIVE & BINDING
