
# Console Logging & Diagnostic Guide
**Purpose:** Know exactly what to look for in browser console during testing  
**Status:** Reference guide (read during Phase 1 testing)  
**Use:** Open DevTools (F12) → Console tab → watch for these messages

---

## 🎯 The Big Picture: What Logs Should You See?

When everything works correctly, you'll see logs in this sequence:

```
═══ PHASE 1 TEST HARNESS LOADS ═══
[TEST 1] Language Detection → ✓ PASS
[TEST 2] Build Payload → ✓ Payload structure correct
[TEST 3] Payload Validation → Valid: true ✓ Validation passed
[TEST 4] RTL Computation → ✓ RTL flag correct

═══ USER CLICKS BUTTON ═══
[useStaging] [COMPETITOR_SPY] PAYLOAD VERIFICATION
[useStaging] [COMPETITOR_SPY] SUCCESS - Signal Stored

═══ RESULT ═══
Toast notification shows: "Added to queue" (EN) or "تمت الإضافة" (AR)
```

---

## 📋 Detailed: What Each Log Means

### Section 1: Test Harness Automated Tests (On Page Load)

**Expected:**
```
═══════════════════════════════════════════════════════════
TEST HARNESS: Phase 1 Verification Started
═══════════════════════════════════════════════════════════
```

**What it means:** Test harness mounted successfully

**If missing:** Component didn't render

---

**Expected:**
```
[TEST 1] Language Detection
  Detected language: en
  Expected: 'en' or 'ar'
  ✓ PASS: Language detected = true
```

**What it means:**
- `useLocale()` worked
- Returns `'en'` or `'ar'` (valid value)
- Language detection passes

**If shows `false`:**
- useLocale() returning invalid value
- Check language context setup
- Or useLocale() returning undefined/null

**If shows `ar` vs `en`:**
- Normal - depends on current app language
- Make sure you test BOTH later

---

**Expected:**
```
[TEST 2] Build Payload with Language
  Built payload:
    - source: competitor_spy
    - category: competitor_weakness
    - lang: en
    - is_rtl: false
  ✓ Payload structure correct
```

**What it means:**
- Builder function worked
- Payload created with all required fields
- `lang` field is present
- `is_rtl` computed correctly

**If `lang` is missing:**
- buildStagingPayload() didn't set it
- Check function parameters

**If `is_rtl` is wrong:**
- Should be `false` for 'en'
- Should be `true` for 'ar'

---

**Expected:**
```
[TEST 3] Payload Validation
  Valid: true
  ✓ Validation passed
```

**What it means:**
- Payload structure is valid
- All required fields present
- Validation function passed

**If `Valid: false`:**
- Look for error messages below
- Something wrong with payload structure

---

**Expected:**
```
[TEST 4] RTL Computation
  Language: en
  is_rtl: false
  Expected: false
  ✓ RTL flag correct = true
```

**What it means:**
- RTL flag computed from language correctly
- English → `is_rtl: false` ✓
- Arabic → `is_rtl: true` ✓

**If shows `✗ RTL flag correct = false`:**
- isRtlLanguage() function not working
- Language detection might be wrong

---

### Section 2: Test Harness Results Box

**Expected (visible in UI):**
```
Automated Test Results

Language Detected: en (green ✓)
Payload Valid: ✓ YES (green)
RTL Computed Correctly: ✓ YES (green)

Payload Structure:
{
  "source": "competitor_spy",
  "category": "competitor_weakness",
  "intent": "competitor_weakness",
  "content_array": [...],
  "lang": "en",
  "is_rtl": false,
  ...
}
```

**What it means:**
- All 4 automated tests passed
- Ready to manually test button

**If any shows RED:**
- Stop
- Fix the issue
- Re-run test

---

### Section 3: User Clicks Button (Manual Test)

**Expected:**
```
[useStaging] [COMPETITOR_SPY] PAYLOAD VERIFICATION (Before DB Write)
  source: competitor_spy
  category: competitor_weakness
  intent: competitor_weakness
  language: en
  is_rtl: false
  content_array length: 3
  content_array: (3) ['fitness tracker', 'calorie counter', 'workout planner']
  ✓ is_rtl: false
```

**What it means:**
- useStaging hook called
- Hook validated payload
- Hook logged payload details
- Ready to send to API

**Check each field:**
| Field | Should Be |
|-------|-----------|
| `source` | 'competitor_spy' |
| `category` | 'competitor_weakness' |
| `intent` | 'competitor_weakness' |
| `language` | 'en' or 'ar' (current) |
| `is_rtl` | false if 'en', true if 'ar' |
| `content_array length` | > 0 (should have keywords) |

**If `language` is wrong:**
- Check useLocale() returning correct value
- Payload might have wrong lang

**If `is_rtl` is wrong:**
- isRtlLanguage() not computing correctly
- Check if language is in RTL list ['ar']

---

**Expected (after a brief moment):**
```
[useStaging] [COMPETITOR_SPY] SUCCESS - Signal Stored in Vault
  signal_id: 550e8400-e29b-41d4-a716-446655440000
  created_at: 2026-06-07T12:34:56.789Z
  signal_type: competitor_weakness
  language: en
  ✓ Retrieved keywords from metadata (3): ['fitness tracker', 'calorie counter', 'workout planner']
```

**What it means:**
- API call succeeded
- Signal stored in database
- Signal has UUID ID
- Language field preserved
- Keywords accessible from metadata

**Check:**
- ✓ signal_id is UUID format (correct)
- ✓ created_at is ISO timestamp (correct)
- ✓ language matches what was sent (correct)
- ✓ keywords retrieved from metadata (correct)

**If `signal_id` is missing:**
- API didn't return ID
- API endpoint problem
- Database insert failed

**If `language` is missing:**
- Not sent in payload
- Not stored in database
- Check payload language field

---

### Section 4: Toast Notification

**Expected (should see in UI):**

**English:**
```
✓ Added to queue
```

**Arabic:**
```
✓ تمت الإضافة بنجاح
```

**What it means:**
- useStaging hook called showToast()
- Toast notification auto-dismissed after 3 seconds

**If doesn't appear:**
- useToast hook not working
- showToast() not called
- Toast library issue

---

### Section 5: Button UI Changes

**Expected state transitions:**

1. **BEFORE clicking:**
   - Button text: "Test Add" (EN) or "اختبار الإضافة" (AR)
   - Icon: Zap ⚡
   - State: Enabled (clickable)

2. **AFTER clicking (< 1 second):**
   - Button text: "Adding..." (EN) or "جاري الإضافة..." (AR)
   - Icon: Spinner 🔄 (rotating)
   - State: Disabled (grayed out)

3. **AFTER API response (< 5 seconds):**
   - Button text: "Added" (EN) or "تمت الإضافة" (AR)
   - Icon: Checkmark ✓
   - State: Disabled (grayed out, showing success)

**If state doesn't change:**
- useStaging hook loading/staged states not updating
- React not re-rendering

**If states persist:**
- Auto-reset to "enabled" after 2 seconds
- Should be clickable again for retry

---

## 🔍 What NOT to See (Red Flags)

### ❌ If You See These, Something's Wrong

**Error 1: TypeScript Error in Console**
```
TypeError: Cannot read property 'toUpperCase' of undefined
```
**Cause:** source is undefined  
**Fix:** Check payload being built correctly

---

**Error 2: Network Error**
```
Failed to fetch: TypeError: fetch is not a function
Network error: 404 /api/workspaces/staging/add
```
**Cause:** API endpoint doesn't exist or wrong path  
**Fix:** Verify endpoint path exists

---

**Error 3: Missing useToast**
```
ReferenceError: useToast is not defined
```
**Cause:** useToast hook not available  
**Fix:** Implement or fix import path

---

**Error 4: Import Not Found**
```
Module not found: Can't resolve '@/hooks/useStaging'
```
**Cause:** File not at that path  
**Fix:** Check file location

---

**Error 5: Language Not Detected**
```
[TEST 1] Language Detection
  Detected language: undefined
  ✓ PASS: Language detected = false ← FALSE!
```
**Cause:** useLocale() returning undefined  
**Fix:** Check language context or replace with your method

---

## 📊 Console Log Levels Reference

### ℹ️ Info (Blue)
```
[TEST 1] Language Detection
```
Informational, expected

### ✓ Success (Green)
```
✓ Payload structure correct
✓ Validation passed
✓ RTL flag correct
```
Good sign

### ⚠️ Warning (Yellow)
```
Warning: React does not recognize the 'dir' prop
```
Usually harmless, but check if concerning

### ❌ Error (Red)
```
Error: Cannot read property
Uncaught TypeError:
```
Problem, needs fixing

---

## 🧪 Testing Checklist: Console Logs

### When You Load the Test Page

- [ ] See: `TEST HARNESS: Phase 1 Verification Started`
- [ ] See: `[TEST 1]` through `[TEST 4]` all with ✓
- [ ] All show green checkmarks
- [ ] No errors in console
- [ ] Test results box shows all green

### When You Click Button

- [ ] See: `[useStaging] [COMPETITOR_SPY] PAYLOAD VERIFICATION`
- [ ] Console shows `language: en` or `language: ar`
- [ ] Console shows `is_rtl: false` or `is_rtl: true` (correct)
- [ ] Console shows `content_array length: 3` (or your count)
- [ ] After API call: See `SUCCESS - Signal Stored`
- [ ] See: `signal_id: <uuid>`
- [ ] See: `✓ Retrieved keywords from metadata`
- [ ] Toast notification appears (EN or AR)
- [ ] No errors in console
- [ ] Button changes to checkmark state

### Environment-Specific

**If Testing with English (lang: 'en'):**
- [ ] `language: en` shown in logs
- [ ] `is_rtl: false` shown in logs
- [ ] Toast says "Added to queue"
- [ ] Button text in English
- [ ] Button layout left-to-right

**If Testing with Arabic (lang: 'ar'):**
- [ ] `language: ar` shown in logs
- [ ] `is_rtl: true` shown in logs
- [ ] Toast says "تمت الإضافة" (Arabic)
- [ ] Button text in Arabic: "اختبار الإضافة"
- [ ] Button layout right-to-left (`dir="rtl"`)

---

## 🔧 Filtering Logs for Clarity

### In Browser DevTools

**Filter by source:**
```
[useStaging]
```

**Filter by module:**
```
[COMPETITOR_SPY]
```

**Filter by action:**
```
PAYLOAD VERIFICATION
SUCCESS
ERROR
```

**Hide logs you don't care about:**
```
-React
-console
```

---

## 📝 Example: Complete Successful Test Session

### Step 1: Load Test Page
**Console shows:**
```
═══════════════════════════════════════════════════════════
TEST HARNESS: Phase 1 Verification Started
═══════════════════════════════════════════════════════════

[TEST 1] Language Detection
  Detected language: en
  Expected: 'en' or 'ar'
  ✓ PASS: Language detected = true

[TEST 2] Build Payload with Language
  Built payload:
    - source: competitor_spy
    - category: competitor_weakness
    - lang: en
    - is_rtl: false
  ✓ Payload structure correct

[TEST 3] Payload Validation
  Valid: true
  ✓ Validation passed

[TEST 4] RTL Computation
  Language: en
  is_rtl: false
  Expected: false
  ✓ RTL flag correct = true

═══════════════════════════════════════════════════════════
TEST HARNESS: All automated tests completed
═══════════════════════════════════════════════════════════
```

**UI shows:**
- Test Results box: All green ✓
- Button visible and enabled
- Ready to click

### Step 2: Click Button
**Console immediately shows:**
```
[useStaging] [COMPETITOR_SPY] PAYLOAD VERIFICATION (Before DB Write)
  source: competitor_spy
  category: competitor_weakness
  intent: competitor_weakness
  language: en
  is_rtl: false
  content_array length: 3
  content_array: (3) ['fitness tracker', 'calorie counter', 'workout planner']
  ✓ is_rtl: false
```

**UI shows:**
- Button text: "Adding..."
- Button icon: Spinner (rotating)
- Button disabled

### Step 3: API Response (1-2 seconds later)
**Console shows:**
```
[useStaging] [COMPETITOR_SPY] SUCCESS - Signal Stored in Vault
  signal_id: 550e8400-e29b-41d4-a716-446655440000
  created_at: 2026-06-07T12:34:56.789Z
  signal_type: competitor_weakness
  language: en
  ✓ Retrieved keywords from metadata (3): ['fitness tracker', 'calorie counter', 'workout planner']
```

**UI shows:**
- Toast notification: "✓ Added to queue" (green)
- Button text: "Added"
- Button icon: Checkmark ✓
- Button disabled

### Step 4: 2 Seconds Later
**UI shows:**
- Toast auto-dismissed
- Button reverts to clickable state (can click again)

---

## 🎯 Success Indicator

When you see ALL of these, Phase 1 is PASSING:

1. ✅ Automated tests all show ✓ PASS
2. ✅ Language detected (en or ar)
3. ✅ Payload built with lang field
4. ✅ Payload validated successfully
5. ✅ RTL flag computed correctly
6. ✅ Button click triggers logs
7. ✅ [useStaging] PAYLOAD VERIFICATION shown
8. ✅ SUCCESS message shown
9. ✅ signal_id returned (UUID format)
10. ✅ Toast notification appears (bilingual)
11. ✅ No errors in console
12. ✅ Button states transition correctly

---

## 🚨 Critical Red Flags

**STOP if you see:**
- ❌ TypeScript error messages
- ❌ "Cannot find module" errors
- ❌ `useLocale is not a function`
- ❌ Toast doesn't appear
- ❌ `signal_id` is null/undefined
- ❌ "language is undefined"
- ❌ Multiple clicks required to stage
- ❌ Payload validation failing
- ❌ HTTP 404/500 API errors

**When you see RED FLAGS:**
1. Stop testing
2. Check error message carefully
3. Reference the Troubleshooting section
4. Fix the issue
5. Reload page
6. Test again

---

## 📞 Quick Reference: What Each Field Tells You

| Log Field | Meaning | Good Value | Bad Value |
|-----------|---------|-----------|-----------|
| `language` | Detected user language | `'en'` or `'ar'` | `undefined`, null, wrong value |
| `is_rtl` | RTL flag computed | `true` for ar, `false` for en | opposite of language |
| `source` | Module identifier | `'competitor_spy'` | missing, wrong |
| `category` | Signal category | `'competitor_weakness'` | missing, wrong |
| `content_array` | Main data | Has items | Empty array |
| `signal_id` | Database UUID | UUID format | null, empty string |
| `created_at` | Timestamp | ISO format | null, undefined |

---

**Next Step:** Use this guide while running PHASE_1_DEPLOYMENT.md

---
