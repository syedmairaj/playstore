# Local Testing Guide: Competitor Data Isolation

**Objective:** Verify 3D isolation works correctly before pushing to main

**Status:** Ready for Local Testing

---

## Prerequisites

1. **Database Migration Already Applied** ✅
   - You've run the SQL migration in Supabase
   - Index `idx_competitor_signal_isolation` exists

2. **Code Changes Committed** ✅
   - New API endpoint: `/app/api/workspaces/[workspaceId]/competitors/[competitorId]/keywords/route.ts`
   - Updated component: `/components/competitor-spy/keyword-surfaces-inline.tsx`
   - Updated contract: `/src/types/staging-contract.ts`

3. **Environment Setup**
   - `.env.local` has Supabase credentials configured
   - Node modules installed: `npm install`

---

## Step 1: Build Locally

```bash
cd /Users/syedmairaj/Documents/playstore

# Install dependencies
npm install

# Build the project
npm run build
```

**Expected Output:**
```
> next build

▲ Next.js 15.x.x
- Compiling client
- Compiling server
✓ Compiled successfully
```

If you see **TypeScript errors**, resolve them before proceeding.

---

## Step 2: Start Dev Server

```bash
npm run dev
```

**Expected Output:**
```
▲ Next.js 15.x.x
- ready started server on 0.0.0.0:3000, url: http://localhost:3000
```

Server will be running on `http://localhost:3000`

---

## Step 3: Manual Testing Checklist

### Test A: Different Keywords Per Competitor

**Setup:**
- Open browser to `http://localhost:3000`
- Navigate to **Competitor Spy** module
- Make sure you have at least 2 competitors loaded

**Test:**
1. **Select Competitor A (English)**
   - Look at "keywords" badge count (e.g., "12 keywords")
   - Expand to see actual keywords
   - **Note:** All keywords displayed
   
2. **Select Competitor B (English)**
   - Look at keywords badge count
   - **Expected:** Different count than Competitor A
   - **Expected:** Different keywords in the list
   - **NOT EXPECTED:** Same keywords as A
   
3. **Record Results:**
   ```
   Competitor A (EN): [Count and 3 sample keywords]
   Competitor B (EN): [Count and 3 sample keywords]
   Are they different? YES / NO ✓
   ```

**What's Being Tested:**
- API endpoint: `/api/workspaces/{id}/competitors/A/keywords?language=en`
- Filter in database: `metadata->competitor_id = 'A'` ✓
- Filter in database: `language = 'en'` ✓

---

### Test B: Language Isolation (EN vs AR)

**Setup:**
- Same competitor (e.g., Competitor A)
- Language switcher in your app

**Test:**
1. **Select Competitor A, Language = English**
   - Note the keywords displayed
   - **Example:** ["fitness tracker", "gym tracker", "workout planner"]

2. **Switch Language to Arabic**
   - **Expected:** Keywords CHANGE to Arabic
   - **Example:** ["متتبع اللياقة", "متتبع الرياضة", "مخطط التمرين"]
   - **NOT EXPECTED:** English keywords still showing

3. **Switch Back to English**
   - **Expected:** Original English keywords return
   - **NOT EXPECTED:** Arabic keywords still visible

4. **Record Results:**
   ```
   Competitor A (EN): "fitness tracker", "gym tracker", "workout planner"
   Competitor A (AR): "متتبع اللياقة", "متتبع الرياضة", "مخطط التمرين"
   Are they different? YES / NO ✓
   No mixing? YES / NO ✓
   ```

**What's Being Tested:**
- API endpoint includes `language` parameter
- Database filter: `language = 'en'` vs `language = 'ar'`
- No cross-language contamination

---

### Test C: No Stale Data When Switching

**Setup:**
- 3 competitors available

**Test:**
1. **Select Competitor A**
   - Note the keywords count: `A_count = X`
   - Note 3 sample keywords

2. **Select Competitor B**
   - Note the keywords count: `B_count = Y`
   - Note 3 sample keywords
   - **Verify:** Competitor B's keywords are DIFFERENT from A
   - **Verify:** Competitor B's count (Y) is DIFFERENT from A (X)

3. **Select Competitor C**
   - Note the keywords count: `C_count = Z`
   - **Verify:** Different from both A and B

4. **Switch Back to Competitor A**
   - **Expected:** A_count is still X
   - **Expected:** Same 3 sample keywords as before
   - **NOT EXPECTED:** Keywords from B or C mixed in

5. **Record Results:**
   ```
   Competitor A: Count = X, Sample = [...]
   Competitor B: Count = Y, Sample = [...] [Different from A? YES/NO]
   Competitor C: Count = Z, Sample = [...] [Different from A&B? YES/NO]
   Back to A: Count = X, Sample = [...] [No stale data? YES/NO]
   ```

**What's Being Tested:**
- API isolation: Each competitor query returns ONLY that competitor
- No data leakage: B's data doesn't contaminate A
- Stale data prevention: Switching back gets fresh data

---

### Test D: Browser Console for API Calls

**Setup:**
- Open Browser DevTools: `F12` or `Right-Click → Inspect`
- Go to **Network** tab
- Keep it open while testing

**Test:**
1. **Select Competitor A (EN)**
   - Look at Network tab
   - Find request to: `/api/workspaces/.../competitors/.../keywords?language=en`
   - **Click it** to see details

2. **Verify Request URL**
   - Should include: `competitorPackageId` (in path)
   - Should include: `language=en` (in query)
   - **Example:** `/api/workspaces/ws-123/competitors/com.fittrack.pro/keywords?language=en`

3. **Verify Response**
   - Click **Response** tab
   - Should see JSON with structure:
     ```json
     {
       "keywords": {
         "high_volume": [...],
         "intent_based": [...],
         "competitor_gap": [...]
       },
       "competitor_id": "com.fittrack.pro",
       "competitor_name": "FitTrack Pro",
       "language": "en"
     }
     ```

4. **Switch to Competitor B**
   - Find new API request in Network tab
   - URL should have DIFFERENT `competitorPackageId`
   - Response should have DIFFERENT keywords

5. **Record Results:**
   ```
   Competitor A request URL: /api/workspaces/.../competitors/A/keywords?language=en
   Competitor B request URL: /api/workspaces/.../competitors/B/keywords?language=en
   Response structure correct? YES / NO ✓
   Different data in each response? YES / NO ✓
   ```

**What's Being Tested:**
- Correct API endpoint being called
- Correct parameters being passed
- API returning isolated data structure

---

### Test E: Check Browser Console for Errors

**Setup:**
- DevTools open
- Go to **Console** tab

**Test:**
1. **Perform Test A-D above**
2. **Watch Console for errors**
   - **Should see:** `[KeywordSurfacesInline] Fetched N keywords...` (INFO logs)
   - **Should NOT see:** Red error messages
   - **Should NOT see:** `Failed to fetch`

3. **Record Results:**
   ```
   Any error messages? YES / NO
   If YES, what errors? [...]
   Info logs showing successful fetches? YES / NO ✓
   ```

---

## Step 4: Database Verification (Optional but Recommended)

If tests fail, check the database directly:

```bash
# Open Supabase console and run:
SELECT 
  metadata->>'competitor_id' as competitor_id,
  language,
  COUNT(*) as signal_count
FROM workspace_staging_vault
WHERE workspace_id = 'YOUR_WORKSPACE_ID'
  AND signal_type = 'competitor_weakness'
GROUP BY 1, 2
ORDER BY 1, 2;
```

**Expected Output:**
```
competitor_id                    | language | signal_count
---------------------------------|----------|-------------
com.fittrack.pro                 | en       | 1
com.fittrack.pro                 | ar       | 1
com.myfitnesspal.pro             | en       | 1
com.myfitnesspal.pro             | ar       | 1
```

- Each competitor + language combination appears ONCE
- No duplicates
- Both EN and AR signals exist

---

## Testing Results Summary

Fill out this checklist:

### Manual Tests
- [ ] **Test A:** Different keywords per competitor ✓
- [ ] **Test B:** Language isolation (EN vs AR) ✓
- [ ] **Test C:** No stale data when switching ✓
- [ ] **Test D:** API calls visible in Network tab ✓
- [ ] **Test E:** No console errors ✓

### Browser Verification
- [ ] Network requests show correct URLs
- [ ] API responses have correct structure
- [ ] Competitor IDs match between request and response
- [ ] Language parameter correct (en/ar)

### Database Verification (Optional)
- [ ] Competitor signals exist in database
- [ ] Each competitor has exactly 1 signal per language
- [ ] metadata->>'competitor_id' field is populated
- [ ] No duplicate signals

---

## Troubleshooting

### Issue: Keywords don't change when switching competitors

**Debug Steps:**
1. Open DevTools → Network tab
2. Switch competitors
3. Look for API request to `/api/workspaces/.../competitors/.../keywords`
4. Check if `competitorPackageId` in URL changes
5. Check if response data is different

**If URL doesn't change:**
- Component might not be detecting competitor change
- Check: Is `competitorPackageId` prop being passed correctly?

**If URL changes but data is same:**
- API might not be filtering by competitor_id
- Check: Does API endpoint include `.filter('metadata->competitor_id', 'eq', competitorId)`?

---

### Issue: Language keywords are mixed (EN showing in AR)

**Debug Steps:**
1. Open DevTools → Network tab
2. Switch to Arabic
3. Look for API request with `language=ar`
4. Check response: Should only have Arabic keywords

**If response has English keywords:**
- Check: Is language parameter being passed in API call?
- Check: API query includes `.eq('language', language)`?

---

### Issue: 500 Error on keywords endpoint

**Debug Steps:**
1. Check browser console for error message
2. Check server logs: `npm run dev` terminal
3. Common causes:
   - `workspace_id` is invalid/missing
   - `competitor_id` is invalid/missing
   - Database table `workspace_staging_vault` doesn't exist
   - Index wasn't created successfully

**Solution:**
1. Verify index exists: Run database query from Step 4 above
2. Verify signals exist in database
3. Check `.env.local` has correct Supabase credentials

---

## Next Steps

Once all tests pass:

1. **Document Results**
   - Save the testing checklist above with all ✓ marks

2. **Push to Main**
   ```bash
   git push origin refactor/unified-staging
   # Then merge to main or create PR
   ```

3. **Deploy to Production**
   - Your hosting platform (Vercel/Netlify) will auto-deploy

4. **Monitor in Production**
   - Watch for any errors
   - Verify users report correct keywords per competitor

---

**Ready to test? Start with:**
```bash
cd /Users/syedmairaj/Documents/playstore
npm install
npm run dev
```

Then open `http://localhost:3000` and follow the testing checklist above.
