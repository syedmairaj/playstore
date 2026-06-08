# Current Status: Competitor Keyword Staging System

## ✅ What's Working

1. **Client-side staging call succeeds** ✅
   - `POST /api/workspaces/[id]/staging/add` returns `200 OK`
   - Signal ID returned successfully
   - Toast shows "Added to queue"

2. **Metadata structure is correct** ✅
   ```json
   {
     "competitor_id": "com.myfitnesspal.android",
     "competitor_name": "MyFitnessPal",
     "category_label": "Health & Fitness",
     "language": "en",
     "keywords_by_strategy": {
       "high_volume": [...],
       "intent_based": [...],
       "competitor_gap": [...]
     }
   }
   ```

3. **Duplicate detection works** ✅
   - Analyzing same competitor twice doesn't crash
   - Returns pseudo-ID: `existing-{workspaceId}-{signalType}`
   - Treats duplicates as success

## ❌ What's NOT Working

1. **Retrieval returns 0 records** ❌
   - `GET /api/workspaces/[id]/competitors/[id]/keywords?language=en` returns empty
   - Logs show: `data_returned: 0`
   - But staging logs claim success

2. **Root Cause Unknown** ❓
   - Is data actually being inserted?
   - Is RLS blocking reads?
   - Is metadata structure wrong in database?
   - Are query filters not matching?

## 🔍 What We Need to Debug

### Step 1: Check Server Terminal Logs
When you analyze, look for:
```
[CompetitorKeywords] 📊 All vault records for this workspace:
```

This will show:
- Are there ANY records in the vault?
- What do the metadata fields contain?
- Do the competitor_id values match what we're searching for?

### Step 2: Check If Data Exists in Database
The staging logs say "SUCCESS" but that might be a lie. We need:
1. A log showing the actual INSERT succeeded (not just the duplicate response)
2. OR verify in Supabase dashboard that records exist in `workspace_staging_vault`

### Step 3: Verify Query Matching
If data exists but isn't found, the issue is the query filter:
```sql
metadata->>'competitor_id' = 'com.myfitnesspal.android'
```

Problems could be:
- Case sensitivity (uppercase vs lowercase)
- Extra whitespace
- RLS policy blocking SELECT

## 🚀 Next Actions

### Immediate: Confirm Data Insertion
Add logging that PROVES the INSERT actually happened:

```typescript
// After successful insert, run a SELECT to verify
const { data: verifyData } = await supabase
  .from('workspace_staging_vault')
  .select('id, metadata')
  .eq('workspace_id', workspaceId)
  .eq('signal_type', 'competitor_weakness')
  .limit(1);

console.log('[StagingVault] VERIFICATION - Data actually in DB:', {
  was_inserted: !!verifyData && verifyData.length > 0,
  record_count: verifyData?.length,
  first_record: verifyData?.[0],
});
```

### Secondary: Debug Query Filters
If data exists but isn't retrieved, test the exact filter:
```typescript
// Test the metadata filter independently
const { data: filterTest } = await supabase
  .from('workspace_staging_vault')
  .select('*')
  .filter("metadata->>'competitor_id'", 'eq', competitorId)
  .limit(10);
```

## 📋 Current File Status

- ✅ `/src/lib/staging-vault/staging-vault-service.ts` - Has INSERT logic + duplicate handling
- ✅ `/app/api/workspaces/[workspaceId]/staging/add/route.ts` - API endpoint accepting requests
- ✅ `/app/api/workspaces/[workspaceId]/competitors/[competitorId]/keywords/route.ts` - Retrieval endpoint with detailed logging
- ✅ `/src/lib/competitor-spy/capture-and-stage-keywords.ts` - Client-side staging call

All files have comprehensive logging. The issue is likely:
1. Data isn't actually being inserted (RLS blocking, or INSERT failing silently)
2. Data exists but query filter isn't matching (metadata format issue)
3. RLS policy blocking SELECT on staging_vault table
