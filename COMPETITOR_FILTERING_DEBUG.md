# Competitor Filtering Not Working - Complete Debugging Guide

**Problem:** Keywords remain the same when changing competitors

**Root Cause:** One or more of these is missing:
1. Frontend not sending competitorPackageId in API request
2. Backend not receiving the parameter
3. Backend not filtering by parameter
4. Database records don't have competitorPackageId in metadata
5. Frontend not refetching when competitor changes

---

## 🔍 Step-by-Step Debugging

### Step 1: Check Frontend is Sending the Parameter

**Action:** Open DevTools → Network tab

**Steps:**
1. Select competitor #1 (e.g., Strava)
2. Click "Exploit Data"
3. Navigate to AI Optimizer
4. Look at the Network tab for a request to `/api/workspaces/...staging`
5. Click on that request
6. Check the "URL" field

**What you should see:**
```
✓ CORRECT:
/api/workspaces/workspace-123/staging?signalType=exploit_data&language=en&competitorPackageId=com.strava

✗ WRONG:
/api/workspaces/workspace-123/staging?signalType=exploit_data&language=en
(missing competitorPackageId)
```

**If URL is WRONG:**
- The frontend component is not receiving `competitorPackageId` prop
- Check: Is the parent component passing `competitorPackageId={...}` to `<AIListingOptimizerExploit />`?

**Example (parent component):**
```typescript
<AIListingOptimizerExploit
  workspaceId={workspace}
  appId={app}
  competitorPackageId={selectedCompetitor?.packageId}  // ← Must pass this
  competitorId={selectedCompetitor?.id}
/>
```

---

### Step 2: Check Backend is Receiving the Parameter

**Action:** Add console.log to your API endpoint

**File:** `pages/api/workspaces/[workspaceId]/staging.ts`

**Add this at the start:**
```typescript
export default async function handler(req, res) {
  const { competitorPackageId } = req.query;
  
  console.log('=== STAGING API DEBUG ===');
  console.log('competitorPackageId:', competitorPackageId);
  console.log('Full query:', req.query);
  console.log('========================');
  
  // ... rest of code
}
```

**Refresh browser and check your server logs**

**What you should see:**
```
✓ CORRECT:
=== STAGING API DEBUG ===
competitorPackageId: com.strava
Full query: {
  signalType: 'exploit_data',
  language: 'en',
  competitorPackageId: 'com.strava'
}
========================

✗ WRONG:
=== STAGING API DEBUG ===
competitorPackageId: undefined
Full query: {
  signalType: 'exploit_data',
  language: 'en'
}
========================
```

**If parameter is UNDEFINED:**
- Problem is at Step 1 above (frontend not sending)
- Check that `competitorPackageId` is being passed to the component

---

### Step 3: Check WHERE Clause is Being Built Correctly

**Action:** Add more debugging to see the SQL query

**File:** `pages/api/workspaces/[workspaceId]/staging.ts`

**Add this before db.query():**
```typescript
const whereConditions: string[] = [
  "workspace_id = $1",
  "signal_type = $2",
  "language = $3",
];
const params: any[] = [workspaceId, signalType, language];

if (competitorPackageId && competitorPackageId !== '') {
  console.log('🔧 Adding competitor filter:', competitorPackageId);
  whereConditions.push(`metadata->>'competitorPackageId' = $${params.length + 1}`);
  params.push(competitorPackageId);
} else {
  console.log('⚠️ NO competitor filter - returning all competitors');
}

const whereClause = whereConditions.join(' AND ');
console.log('📋 Final WHERE clause:', whereClause);
console.log('📊 Final params:', params);

const query = `
  SELECT * FROM workspace_staging_vault
  WHERE ${whereClause}
  ORDER BY created_at DESC
  LIMIT $${params.length + 1} OFFSET $${params.length + 2}
`;

console.log('🔍 Executing query:', query);
```

**What you should see:**
```
✓ CORRECT:
🔧 Adding competitor filter: com.strava
📋 Final WHERE clause: workspace_id = $1 AND signal_type = $2 AND language = $3 AND metadata->>'competitorPackageId' = $4
📊 Final params: [ 'workspace-123', 'exploit_data', 'en', 'com.strava' ]
🔍 Executing query: SELECT * FROM workspace_staging_vault WHERE workspace_id = $1 AND ...

✗ WRONG:
⚠️ NO competitor filter - returning all competitors
📋 Final WHERE clause: workspace_id = $1 AND signal_type = $2 AND language = $3
📊 Final params: [ 'workspace-123', 'exploit_data', 'en' ]
```

**If WHERE clause doesn't include competitor:**
- The `competitorPackageId` parameter is undefined (see Step 2)

---

### Step 4: Check Database Has Competitor Metadata

**Action:** Query your database directly

**SQL Command:**
```sql
SELECT
  id,
  signal_type,
  language,
  metadata->>'competitorPackageId' as competitor_package_id,
  metadata->>'keywordCount' as keyword_count,
  created_at
FROM workspace_staging_vault
WHERE signal_type = 'exploit_data'
ORDER BY created_at DESC
LIMIT 20;
```

**What you should see:**
```
✓ CORRECT - Competitor metadata is present:
id      | signal_type  | language | competitor_package_id | keyword_count | created_at
────────┼──────────────┼──────────┼──────────────────────┼───────────────┼─────────────
sig-001 | exploit_data | en       | com.strava           | 12            | 2026-06-07 10:00
sig-002 | exploit_data | en       | com.myfitnesspal     | 8             | 2026-06-07 10:10
sig-003 | exploit_data | ar       | com.strava           | 12            | 2026-06-07 11:00

✗ WRONG - Competitor metadata is NULL or missing:
id      | signal_type  | language | competitor_package_id | keyword_count | created_at
────────┼──────────────┼──────────┼──────────────────────┼───────────────┼─────────────
sig-001 | exploit_data | en       | (NULL)               | 12            | 2026-06-07 10:00
sig-002 | exploit_data | en       | (NULL)               | 8             | 2026-06-07 10:10
```

**If competitor_package_id is NULL:**
- The hook handler isn't storing competitorPackageId in metadata
- Check: `useStaging-exploit-handler.ts` is correctly setting metadata.competitorPackageId
- The payload coming from CompetitorSpyClient must include competitor info

**Check the stored data contains competitor info:**
```sql
SELECT metadata FROM workspace_staging_vault
WHERE id = 'sig-001' LIMIT 1;
```

**Should show:**
```json
{
  "keywords": ["fitness tracker", ...],
  "competitorPackageId": "com.strava",
  "keywordCount": 12,
  "language": "en",
  "is_rtl": false,
  ...
}
```

---

### Step 5: Check Query Results Count

**Action:** Add logging after db.query()

**File:** `pages/api/workspaces/[workspaceId]/staging.ts`

**Add this after db.query():**
```typescript
const result = await db.query(query, params);

console.log('📦 Query returned:', result.rows.length, 'records');
console.log('🎯 Filtering by competitor:', competitorPackageId || 'all');
console.log('🌍 Language filter:', language);

if (result.rows.length === 0) {
  console.warn('⚠️ ZERO records returned! Check:');
  console.warn('  1. Does database have records with this competitor?');
  console.warn('  2. Is language filter correct?');
  console.warn('  3. Is competitorPackageId spelled correctly?');
}

// Log first record for inspection
if (result.rows.length > 0) {
  console.log('📄 First record metadata:', result.rows[0].metadata);
}
```

**What you should see:**
```
✓ CORRECT:
📦 Query returned: 1 records
🎯 Filtering by competitor: com.strava
🌍 Language filter: en
📄 First record metadata: { keywords: [...], competitorPackageId: 'com.strava', ... }

✗ WRONG - Still getting all records:
📦 Query returned: 5 records  (Should be 1!)
🎯 Filtering by competitor: com.strava
🌍 Language filter: en
```

---

## 🚀 Quick Diagnostic Flow

Run through this checklist to find the issue:

```
1. Keywords don't change when competitor changes
   ├─ Check: Is competitorPackageId in frontend API URL?
   │  └─ NO → Issue in Step 1 (frontend not sending)
   │  └─ YES → Continue to step 2
   │
   ├─ Check: Does backend receive competitorPackageId?
   │  └─ NO → Issue in Step 1 (URL being stripped somewhere)
   │  └─ YES → Continue to step 3
   │
   ├─ Check: Is WHERE clause including competitor filter?
   │  └─ NO → Parameter not being added to SQL
   │  └─ YES → Continue to step 4
   │
   ├─ Check: Does database have competitor metadata?
   │  └─ NO → Issue in hook (not storing competitor info)
   │  └─ YES → Continue to step 5
   │
   └─ Check: Does query return 1 record, not 5?
      └─ NO → WHERE clause working but old data cached
      └─ YES → Everything working, check frontend cache
```

---

## 🔧 Common Fixes

### Issue A: competitorPackageId not passed from parent component

**Location:** Where you render `<AIListingOptimizerExploit />`

**Before:**
```typescript
<AIListingOptimizerExploit
  workspaceId={workspace}
  appId={app}
/>
```

**After:**
```typescript
<AIListingOptimizerExploit
  workspaceId={workspace}
  appId={app}
  competitorPackageId={selectedCompetitor?.packageId}
  competitorId={selectedCompetitor?.id}
/>
```

---

### Issue B: Backend doesn't have competitor filter in SQL

**Location:** `pages/api/workspaces/[workspaceId]/staging.ts`

**Before:**
```typescript
const query = `
  SELECT * FROM workspace_staging_vault
  WHERE workspace_id = $1 AND signal_type = $2 AND language = $3
`;
```

**After:**
```typescript
if (competitorPackageId && competitorPackageId !== '') {
  whereConditions.push(`metadata->>'competitorPackageId' = $${params.length + 1}`);
  params.push(competitorPackageId);
}

const whereClause = whereConditions.join(' AND ');
const query = `
  SELECT * FROM workspace_staging_vault
  WHERE ${whereClause}
`;
```

---

### Issue C: Hook not storing competitor info in database

**Location:** `hooks/useStaging-exploit-handler.ts`

**Before:**
```typescript
const vaultRecord = {
  workspace_id: options.workspaceId,
  metadata: {
    keywords: data.keywords,
    // Missing: competitorPackageId
  },
};
```

**After:**
```typescript
const vaultRecord = {
  workspace_id: options.workspaceId,
  metadata: {
    keywords: data.keywords,
    competitorPackageId: payload.metadata?.competitorPackageId,
    // ← Add this from payload
  },
};
```

---

### Issue D: CompetitorSpyClient not passing competitor info in payload

**Location:** `components/competitor-spy/CompetitorSpyClientExploit.tsx`

**Before:**
```typescript
const payload: ExploitAction = {
  action: 'exploit_data',
  data: { ... },
  metadata: {
    sourceModule: 'competitor_spy',
  },
};
```

**After:**
```typescript
const payload: ExploitAction = {
  action: 'exploit_data',
  data: { ... },
  metadata: {
    sourceModule: 'competitor_spy',
    competitorPackageId: competitorPackageId,
    competitorId: competitorId,
    // ← Add competitor info from props
  },
};
```

And add props to component:
```typescript
interface CompetitorSpyClientExploitProps {
  workspaceId: string;
  appId: string;
  competitorId?: string;        // ← Add
  competitorPackageId?: string; // ← Add
}

export function CompetitorSpyClientExploit({
  workspaceId,
  appId,
  competitorId,
  competitorPackageId,
}: CompetitorSpyClientExploitProps) {
```

---

## 📊 Expected Data Flow

```
User selects Competitor (Strava)
  ↓
competitorPackageId = "com.strava" (set in parent component state)
  ↓
Parent passes to AIOptimizer: <AIOptimizer competitorPackageId="com.strava" />
  ↓
AIOptimizer useEffect dependency includes competitorPackageId
  ↓
Fetch: /api/staging?competitorPackageId=com.strava&language=en
  ↓
Backend receives: req.query.competitorPackageId = "com.strava"
  ↓
Adds to WHERE: metadata->>'competitorPackageId' = $4
  ↓
Query only returns records for Strava (1 record with 12 keywords)
  ↓
Frontend displays: 12 keywords ✓

User selects Different Competitor (MyFitnessPal)
  ↓
competitorPackageId = "com.myfitnesspal" (state updates)
  ↓
AIOptimizer useEffect triggers (dependency changed)
  ↓
Fetch: /api/staging?competitorPackageId=com.myfitnesspal&language=en
  ↓
Backend receives: req.query.competitorPackageId = "com.myfitnesspal"
  ↓
Adds to WHERE: metadata->>'competitorPackageId' = $4
  ↓
Query only returns records for MyFitnessPal (1 record with 8 keywords)
  ↓
Frontend displays: 8 keywords (NOT 12!) ✓
```

---

## 🎯 To Verify Everything Works

**Test Case 1:** Exploit competitor #1 (12 keywords) → AI Optimizer shows 12 ✓

**Test Case 2:** Go back, exploit competitor #2 (8 keywords) → Database now has 2 records

**Test Case 3:** In AI Optimizer, API request should have `competitorPackageId=com.myfitnesspal`

**Test Case 4:** AI Optimizer shows 8 keywords (not 12 from competitor #1)

**Test Case 5:** Database query shows both records, with different competitorPackageId values

If all 5 pass, competitor filtering is working! ✅

---

## ❓ Still Not Working?

Share:
1. Screenshot of Network request URL (DevTools)
2. Backend console logs from steps 1-3 above
3. Database query result from step 4
4. Current implementation of useStaging-exploit-handler.ts

Then I can pinpoint the exact issue. ✅
