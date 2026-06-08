# Fix Summary: JSON Serialization Error (22P02) & Competitor Isolation

## Issues Fixed

### 1. **22P02: Invalid Input Syntax for Type JSON**
**Root Cause:** Metadata object sent to Supabase without JSON validation

**Files Fixed:**
- `/lib/staging-vault/staging-vault-service.ts` — Added JSON.stringify validation before insert
- `/lib/staging-vault/competitor-payload-validator.ts` — New validation function (enforces schema)
- `/components/competitor-spy/CompetitorSpyClientExploit.tsx` — Uses proper payload builder

**What Changed:**
```typescript
// BEFORE: Raw object, could fail JSON serialization
metadata: {
  keywords: data.keywords,
  vulnerabilities: data.vulnerabilities,
  // missing competitor_id!
}

// AFTER: Validated, structured, includes isolation keys
metadata: {
  competitor_id: input.competitorId,  // ← ISOLATION KEY
  competitor_name: input.competitorName,
  keywords_by_strategy: {
    high_volume: [],
    intent_based: [],
    competitor_gap: [],
  },
  vulnerabilities: [],
}
```

---

### 2. **Competitor ID Mismatch**
**Root Cause:** Handler stored `competitorPackageId` but GET endpoint queried for `competitor_id`

**Files Fixed:**
- `/hooks/useStaging-exploit-handler.ts` — Standardized to use `competitor_id` in metadata
- `/lib/staging-vault/competitor-weakness-builder.ts` — New builder ensures correct structure

**What Changed:**
```typescript
// BEFORE: Handler stored competitorPackageId
metadata: {
  competitorPackageId: payload.metadata?.competitorPackageId,
  // API couldn't find it!
}

// AFTER: Handler stores competitor_id (matches API filter)
metadata: {
  competitor_id: competitorPackageId,  // ← What API searches for
  keywords_by_strategy: {
    high_volume: [...],
    intent_based: [...],
    competitor_gap: [...],
  },
}
```

---

### 3. **Missing Payload Builder**
**Root Cause:** Competitor data wasn't being transformed into proper UnifiedStagingPayload

**Files Created:**
- `/lib/staging-vault/competitor-weakness-builder.ts` — Transforms raw data → proper schema

**What It Does:**
```typescript
const payload = buildCompetitorWeaknessPayload({
  competitorId: 'com.fittrack.pro',
  competitorName: 'FitTrack Pro',
  categoryLabel: 'Health & Fitness',
  keywords: ['fitness tracker', 'gym', 'workout'],
  vulnerabilities: ['weak reviews'],
  language: 'en',
  isRtl: false,
  workspaceId: 'ws-123',
});

// Returns: UnifiedStagingPayload with correct structure
// ✓ competitor_id in metadata (for isolation)
// ✓ keywords_by_strategy grouped (for UI)
// ✓ JSON-serializable (no 22P02 errors)
```

---

## Files Changed

1. **lib/staging-vault/staging-vault-service.ts**
   - Added JSON.stringify validation to catch serialization errors early
   - Ensures metadata is never null

2. **hooks/useStaging-exploit-handler.ts**
   - Changed `competitorPackageId` to `competitor_id` in metadata
   - Added `keywords_by_strategy` grouping
   - Added validation before sending

3. **components/competitor-spy/CompetitorSpyClientExploit.tsx**
   - Now uses `buildCompetitorWeaknessPayload()` 
   - Passes proper metadata structure to `stage()`

4. **lib/staging-vault/competitor-payload-validator.ts** (NEW)
   - Validates metadata structure matches schema
   - Prevents invalid JSON from reaching database

5. **lib/staging-vault/competitor-weakness-builder.ts** (NEW)
   - Transforms raw competitor data into UnifiedStagingPayload
   - Ensures all isolation keys are present
   - Groups keywords by strategy

---

## How the Fix Works

### Before (Broken)
```
CompetitorSpyClientExploit
  ↓ (sends raw exploit data)
useStaging.stage()
  ↓ (expects UnifiedStagingPayload)
ERROR: Metadata missing competitor_id
  ↓
Database: 22P02 JSON serialization error
  ↓
Frontend: "No keywords found"
```

### After (Fixed)
```
CompetitorSpyClientExploit
  ↓ (sends raw data to builder)
buildCompetitorWeaknessPayload()
  ↓ (transforms to UnifiedStagingPayload with competitor_id)
useStaging.stage()
  ↓ (validates structure)
staging-vault-service.ts
  ↓ (validates JSON serializability)
Database INSERT with metadata->competitor_id ✓
  ↓
GET /api/competitors/[id]/keywords
  ↓ (filters by metadata->competitor_id)
Returns ONLY that competitor's keywords ✓
```

---

## Testing

### Test 1: JSON Serialization Works
```sql
SELECT metadata FROM workspace_staging_vault
WHERE signal_type = 'competitor_weakness'
LIMIT 1;
-- Should show valid JSON with competitor_id field
```

### Test 2: Competitor Isolation Works
```typescript
// In browser, open Competitor A (EN)
// Note keyword count, e.g., 12

// Switch to Competitor B (EN)
// Verify count is DIFFERENT
// Verify keywords are DIFFERENT

// Network tab should show:
// GET /api/workspaces/.../competitors/com.fittrack.pro/keywords?language=en
// GET /api/workspaces/.../competitors/com.myfitnesspal.pro/keywords?language=en
// (Different competitor IDs in URL)
```

### Test 3: Language Isolation Works
```typescript
// Select Competitor A (English)
// See English keywords

// Switch Language to Arabic
// See Arabic keywords (NOT English)

// Switch back to English
// See English keywords again (no mixing)
```

---

## Database Query to Verify

Run in Supabase SQL Editor:

```sql
SELECT
  metadata->>'competitor_id' as competitor_id,
  metadata->>'competitor_name' as competitor_name,
  language,
  jsonb_array_length(metadata->'keywords_by_strategy'->'high_volume') as high_volume_count,
  created_at
FROM workspace_staging_vault
WHERE signal_type = 'competitor_weakness'
ORDER BY created_at DESC;
```

**Expected Output:**
```
competitor_id              | competitor_name  | language | high_volume_count | created_at
---------------------------|------------------|----------|-------------------|----------
com.fittrack.pro          | FitTrack Pro     | en       | 4                 | 2026-06-07...
com.fittrack.pro          | FitTrack Pro     | ar       | 4                 | 2026-06-07...
com.myfitnesspal.pro      | MyFitnessPal Pro | en       | 4                 | 2026-06-07...
com.myfitnesspal.pro      | MyFitnessPal Pro | ar       | 4                 | 2026-06-07...
```

Each competitor ✓ Each language ✓ No mixing

---

## Next Steps

1. **Rebuild** your local project
2. **Test** competitor switching in Competitor Spy
3. **Verify** keywords change per competitor
4. **Verify** keywords change per language
5. **Run** the SQL query above to confirm database structure

**If all tests pass, commit and push to main.**
