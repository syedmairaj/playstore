# Critical Debug Checklist: Competitor Keywords NULL Issue

**Problem:** Supabase shows all `competitor_id` and `keywords` as `null`  
**Root Cause:** Keywords are never being captured from analysis or are arriving at database without proper structure

---

## ✅ CHECKLIST 1: Verify Data is Being Captured

### 1.1: Add Console Logs to Your Analysis Function
In your competitor analysis handler (wherever keywords are generated), add:

```typescript
console.log('[CompetitorAnalysis] Keywords generated:', {
  competitorId: 'com.fittrack.pro',  // Should NOT be null
  keywords: analysisResults,  // Should be array of strings, NOT empty
  language: userLanguage,  // 'en' or 'ar'
  timestamp: new Date().toISOString(),
});

if (!analysisResults || analysisResults.length === 0) {
  console.error('❌ CRITICAL: Keywords array is empty or null!');
  return;  // Stop here, don't stage empty data
}
```

### Expected Output:
```
✓ competitorId: "com.fittrack.pro"
✓ keywords: ["fitness tracker", "calorie counter", ...]
✓ language: "en"
```

---

## ✅ CHECKLIST 2: Verify Staging Function is Called

### 2.1: Use the Capture Service
Replace wherever you're currently staging keywords with:

```typescript
import { stageCompetitorAnalysis } from '@/lib/competitor-spy/capture-and-stage-keywords';

// When analysis is complete:
const result = await stageCompetitorAnalysis({
  competitorId: 'com.fittrack.pro',  // NOT null
  competitorName: 'FitTrack Pro',
  categoryLabel: 'Health & Fitness',
  keywords: analysisKeywords,  // NOT empty array
  vulnerabilities: [],
  workspaceId: workspaceId,
  language: locale === 'ar' ? 'ar' : 'en',
  isRtl: locale === 'ar',
}, workspaceId);

console.log('Staging result:', result);
if (!result.success) {
  console.error('❌ Failed to stage:', result.error);
  return;
}

console.log('✓ Keywords staged successfully');
```

### Expected Console Output:
```
✓ Validation passed
🔍 COMPETITOR ANALYSIS CAPTURE - PRE-DATABASE LOG
════════════════════════════════════════════════════════════════════════════
✓ competitorId: "com.fittrack.pro"
✓ competitorName: "FitTrack Pro"
✓ categoryLabel: "Health & Fitness"
✓ keywords.length: 12
  Sample keywords: ["fitness tracker","calorie counter","workout planner"]
✓ vulnerabilities.length: 0
✓ workspaceId: "ws-123"
✓ language: "en"
✓ isRtl: false

📦 METADATA OBJECT (will be stored in DB):
{
  "competitor_id": "com.fittrack.pro",
  "competitor_name": "FitTrack Pro",
  "category_label": "Health & Fitness",
  "language": "en",
  "keywords_by_strategy": {
    "high_volume": ["fitness tracker", "calorie counter", "workout planner", "weight loss"],
    "intent_based": ["step counter", "meal tracker", "food scanner app", "diet goals app"],
    "competitor_gap": ["nutrition tracking", "health monitoring", "exercise routine", "activity tracker"]
  },
  "vulnerabilities": [],
  "is_rtl": false
}
✓ JSON.stringify succeeded. Size: 1234 bytes
════════════════════════════════════════════════════════════════════════════

✓ Vault payload prepared
[StageCompetitorAnalysis] POSTing to /api/workspaces/ws-123/staging/add
✓ Successfully staged competitor analysis
  Signal ID: abc123-def456
```

---

## ✅ CHECKLIST 3: Verify API Receives Data

### 3.1: Check Browser Network Tab
1. Open DevTools (F12)
2. Go to **Network** tab
3. Perform competitor analysis
4. Look for POST to `/api/workspaces/.../staging/add`
5. Click it and check **Request** tab

**Expected Request Body:**
```json
{
  "signalType": "competitor_weakness",
  "content": "{\"keywords\":[...],\"vulnerabilities\":[...],...}",
  "source": "competitor_spy",
  "sourceContext": "competitor_weakness",
  "sourceContextId": "com.fittrack.pro",
  "language": "en",
  "metadata": {
    "competitor_id": "com.fittrack.pro",
    "competitor_name": "FitTrack Pro",
    "keywords_by_strategy": {...},
    ...
  }
}
```

**Red Flags to Look For:**
- ❌ `competitor_id` is `null` or missing
- ❌ `keywords` array is empty `[]`
- ❌ `sourceContextId` doesn't match `competitor_id`

---

## ✅ CHECKLIST 4: Verify Database Insert

### 4.1: Check Server Logs
Look at your Next.js server logs (where `npm run dev` is running):

**Expected:**
```
[StagingVault] Metadata validation passed for competitor_weakness: {
  hasCompetitorId: true,
  competitorId: "com.fittrack.pro",
  metadataSize: 1234
}
```

**Red Flags:**
- ❌ `competitorId: undefined`
- ❌ `metadataSize: 0` (empty metadata)
- ❌ Validation error like "competitor_id is required"

### 4.2: If You See a 22P02 Error
```
22P02: invalid input syntax for type json
```

This means metadata failed JSON serialization. Check:
1. Is metadata an object? (not null, not array)
2. Does it have circular references?
3. Are all string values properly quoted?

The validation in `staging-vault-service.ts` should catch this BEFORE it reaches the database.

---

## ✅ CHECKLIST 5: Verify Database Contains Data

### 5.1: Run These Queries in Supabase
```sql
-- Query 1: Check competitor_weakness signals exist
SELECT
  id,
  metadata->>'competitor_id' as competitor_id,
  metadata->>'competitor_name' as competitor_name,
  language,
  (metadata ? 'keywords_by_strategy') as has_keywords
FROM workspace_staging_vault
WHERE signal_type = 'competitor_weakness'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Output:**
```
id              | competitor_id        | competitor_name | language | has_keywords
----------------|----------------------|-----------------|----------|-------------
abc123          | com.fittrack.pro     | FitTrack Pro    | en       | true
def456          | com.fittrack.pro     | FitTrack Pro    | ar       | true
ghi789          | com.myfitnesspal.pro | MyFitnessPal    | en       | true
```

**Red Flags:**
- ❌ `competitor_id` is `null`
- ❌ `has_keywords` is `false`
- ❌ Empty result (no signals at all)

### 5.2: Check Actual Keyword Structure
```sql
SELECT
  metadata->>'competitor_id' as competitor_id,
  language,
  jsonb_array_length(metadata->'keywords_by_strategy'->'high_volume') as high_volume_count,
  jsonb_array_length(metadata->'keywords_by_strategy'->'intent_based') as intent_based_count,
  jsonb_array_length(metadata->'keywords_by_strategy'->'competitor_gap') as competitor_gap_count
FROM workspace_staging_vault
WHERE signal_type = 'competitor_weakness'
  AND metadata->>'competitor_id' = 'com.fittrack.pro'
  AND language = 'en'
LIMIT 1;
```

**Expected Output:**
```
competitor_id   | language | high_volume_count | intent_based_count | competitor_gap_count
-----------------|----------|-------------------|-------------------|---------------------
com.fittrack.pro | en       | 4                 | 4                 | 4
```

**Red Flags:**
- ❌ All counts are 0 or null
- ❌ No results (means competitor wasn't found)

---

## 🔧 QUICK FIX: If Keywords are Still NULL

### Issue: Analysis finishes but keywords aren't passed to staging

**Location:** Find where competitor analysis completes in `CompetitorSpyClient.tsx`

**Current (BROKEN):**
```typescript
// Analysis finishes but keywords aren't being staged
const analysisResult = await runAnalysis();
// Maybe showing UI but NOT calling staging function
```

**Fixed:**
```typescript
// Analysis finishes AND keywords are immediately staged
const analysisResult = await runAnalysis();

const stageResult = await stageCompetitorAnalysis({
  competitorId: selectedCompetitor.packageId,
  competitorName: selectedCompetitor.displayName,
  categoryLabel: 'Inferred Category',
  keywords: analysisResult.keywords || [],  // ← MUST NOT BE EMPTY
  vulnerabilities: analysisResult.vulnerabilities || [],
  workspaceId: workspaceId,
  language: locale === 'ar' ? 'ar' : 'en',
  isRtl: locale === 'ar',
}, workspaceId);

if (!stageResult.success) {
  console.error('Failed to stage keywords:', stageResult.error);
  alert('Failed to save keywords');
  return;
}

console.log('✓ Keywords saved successfully');
```

---

## 📋 Final Verification Test

**On your local dev server:**

1. **Open browser DevTools** (F12)
2. **Go to Competitor Spy** module
3. **Analyze a Competitor** (EN)
4. **Watch the console** - should see detailed logs from `stageCompetitorAnalysis`
5. **Check Network tab** - verify POST to `/api/workspaces/.../staging/add`
6. **Look for keywords in request body** - they MUST NOT be empty
7. **Switch language to Arabic**
8. **Analyze same competitor again** (AR)
9. **Verify different keywords appear** in logs (Arabic instead of English)

---

## ✅ Success Criteria

- [x] Console shows `competitor_id` is NOT null
- [x] Console shows `keywords.length > 0` (not empty)
- [x] Network tab shows POST with keywords in metadata
- [x] Supabase query returns `has_keywords = true`
- [x] Supabase shows `competitor_gap_count > 0`
- [x] English and Arabic keywords are separate
- [x] No 22P02 JSON errors
- [x] Switching competitors shows different keywords

---

## 💡 Key Insights

1. **Keywords must be captured at analysis time** — if analysis doesn't produce keywords, staging can't help
2. **Staging function MUST be called** — logging alone won't save to database
3. **Database validation is strict** — competitor_id must exist and be non-empty
4. **JSON serialization happens twice** — in frontend (staging service) and in backend (staging-vault-service)
5. **Language context is critical** — EN and AR keywords must be separate rows in database
