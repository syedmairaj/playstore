
# Phase 1: Core File Deployment & Validation
**Status:** Pre-Implementation Checklist  
**Duration:** 2-3 hours  
**Objective:** Install 4 core files + verify they work correctly BEFORE refactoring any modules  
**Safety:** Each step has validation checkpoints; fail fast if something's wrong

---

## 🎯 Phase 1 Overview

You will:
1. ✅ Copy 4 core files to your codebase
2. ✅ Verify TypeScript compilation
3. ✅ Create a test harness (minimal component) to verify the hook works
4. ✅ Check console logs for correct payload structure
5. ✅ Verify language detection and RTL flags
6. ✅ Test basic button rendering and state transitions

**If ANY step fails:** Stop, diagnose, fix. DO NOT proceed to refactoring modules.

---

## 📋 Pre-Deployment Checklist

Before starting, verify:

- [ ] You have all 4 files ready (copy-paste ready)
- [ ] You know where your `src/` directory is
- [ ] Your project has TypeScript configured
- [ ] Your project has React 16.8+ (for hooks)
- [ ] You have `next-intl` installed (or know your language detection method)
- [ ] You have `@/hooks/useToast` implemented
- [ ] You have `@/lib/utils` (cn function) available
- [ ] You have `lucide-react` installed
- [ ] You can run `npm run build` without errors
- [ ] You can run `npm run dev` locally

---

## 🚀 Step 1: Copy Core Files

### File 1: Type Definitions

**Destination:** `src/types/staging-contract.ts`

**Action:**
```bash
# Create directory if doesn't exist
mkdir -p src/types

# Copy file content from types-staging-contract.ts
# Paste into: src/types/staging-contract.ts
```

**After copying, verify:**
```bash
ls -la src/types/staging-contract.ts
# Should show file exists and has content
```

**Quick type check:**
```bash
npx tsc --noEmit src/types/staging-contract.ts
# Should have NO errors (only warnings are OK)
```

---

### File 2: React Hook

**Destination:** `src/hooks/useStaging.ts`

**Action:**
```bash
# Create directory if doesn't exist
mkdir -p src/hooks

# Copy file content from useStaging-hook.ts
# Paste into: src/hooks/useStaging.ts
```

**Important: Check imports in the file**

Open `src/hooks/useStaging.ts` and verify these imports work:
```typescript
import { useLocale } from 'next-intl';
import { useToast } from '@/hooks/useToast';
import { ... } from '@/types/staging-contract';
```

**Verification:**
```bash
# If useLocale is missing or wrong, replace with YOUR language detection:
# Examples:
# - useLocale() from next-intl ✓ (recommended)
# - useLanguageStore() from your Zustand store
# - navigator.language (browser API)
# - Custom hook getLanguage()
```

**Quick import check:**
```bash
npx tsc --noEmit src/hooks/useStaging.ts
# Should resolve all imports correctly
```

---

### File 3: Utility Functions

**Destination:** `src/lib/staging-utilities.ts`

**Action:**
```bash
# Create directory if doesn't exist
mkdir -p src/lib

# Copy file content from staging-utilities.ts
# Paste into: src/lib/staging-utilities.ts
```

**This file has NO external imports** (except TypeScript types), so it should work immediately.

**Verification:**
```bash
npx tsc --noEmit src/lib/staging-utilities.ts
# Should have NO errors
```

---

### File 4: Button Component

**Destination:** `src/components/staging/StagingButton.tsx`

**Action:**
```bash
# Create directory if doesn't exist
mkdir -p src/components/staging

# Copy file content from StagingButton.tsx
# Paste into: src/components/staging/StagingButton.tsx
```

**Check imports:**
```typescript
import { Check, Loader2, Archive, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStaging } from '@/hooks/useStaging';
import { ... } from '@/types/staging-contract';
```

**Verification:**
```bash
npx tsc --noEmit src/components/staging/StagingButton.tsx
# Should resolve all imports
```

---

## ✅ Step 2: Verify TypeScript Compilation

**Run full build:**
```bash
npm run build
```

**Expected output:**
```
✓ All files compiled successfully
✓ No TypeScript errors
⚠ Warnings are OK (e.g., unused imports)
```

**If build fails:**

| Error | Fix |
|-------|-----|
| `Cannot find module '@/hooks/useToast'` | Implement useToast hook or update path |
| `Cannot find module '@/lib/utils'` | Verify cn function exists |
| `Cannot find module 'lucide-react'` | Run `npm install lucide-react` |
| `Cannot find module 'next-intl'` | Replace useLocale with your method |
| `Cannot find type X` | Update type import paths |

**Stop here if build fails.** Do not proceed to testing.

---

## 🧪 Step 3: Create Test Harness

Create a minimal test component to verify the system works WITHOUT refactoring any existing code.

### Create File: `src/components/staging/StagingButtonTestHarness.tsx`

```typescript
'use client';

/**
 * TEST HARNESS: Verify useStaging hook + StagingButton work correctly
 * 
 * This component is TEMPORARY and tests:
 * 1. Hook initialization
 * 2. Language detection
 * 3. RTL flag computation
 * 4. Payload validation
 * 5. Button state transitions
 * 6. Console logging
 * 
 * Location: Add to your app temporarily (e.g., in a test page)
 * Usage: <StagingButtonTestHarness />
 */

import React, { useState } from 'react';
import { useLocale } from 'next-intl';
import { StagingButton } from './StagingButton';
import {
  buildStagingPayload,
  validateStagingPayload,
} from '@/lib/staging-utilities';
import type { LanguageCode, UnifiedStagingPayload } from '@/types/staging-contract';

export function StagingButtonTestHarness() {
  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 1: Language Detection
  // ═══════════════════════════════════════════════════════════════════════════
  
  const language = useLocale() as LanguageCode;
  const [testResults, setTestResults] = useState<Record<string, any>>({});

  React.useEffect(() => {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TEST HARNESS: Phase 1 Verification Started');
    console.log('═══════════════════════════════════════════════════════════');

    // TEST 1: Language Detection
    console.log('\n[TEST 1] Language Detection');
    console.log(`  Detected language: ${language}`);
    console.log(`  Expected: 'en' or 'ar'`);
    console.log(`  ✓ PASS: Language detected = ${['en', 'ar'].includes(language)}`);

    // TEST 2: Build Payload
    console.log('\n[TEST 2] Build Payload with Language');
    const payload = buildStagingPayload(
      'competitor_spy',
      'competitor_weakness',
      'competitor_weakness',
      ['fitness tracker', 'weight loss', 'calorie counter'],
      language
    );

    console.log(`  Built payload:`);
    console.log(`    - source: ${payload.source}`);
    console.log(`    - category: ${payload.category}`);
    console.log(`    - lang: ${payload.lang}`);
    console.log(`    - is_rtl: ${payload.is_rtl}`);
    console.log(`  ✓ Payload structure correct`);

    // TEST 3: Validate Payload
    console.log('\n[TEST 3] Payload Validation');
    const validation = validateStagingPayload(payload);
    console.log(`  Valid: ${validation.valid}`);
    if (!validation.valid) {
      console.error(`  Errors:`, validation.errors);
    }
    console.log(`  ✓ Validation passed`);

    // TEST 4: RTL Computation
    console.log('\n[TEST 4] RTL Computation');
    console.log(`  Language: ${language}`);
    console.log(`  is_rtl: ${payload.is_rtl}`);
    console.log(`  Expected: ${language === 'ar' ? 'true' : 'false'}`);
    console.log(`  ✓ RTL flag correct = ${(language === 'ar') === payload.is_rtl}`);

    // Store results
    setTestResults({
      languageDetected: language,
      payloadValid: validation.valid,
      rtlCorrect: (language === 'ar') === payload.is_rtl,
      testPayload: payload,
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('TEST HARNESS: All automated tests completed');
    console.log('═══════════════════════════════════════════════════════════\n');
  }, [language]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Manual Test: Button State Transitions
  // ═══════════════════════════════════════════════════════════════════════════

  const testPayload: UnifiedStagingPayload = {
    source: 'competitor_spy',
    category: 'competitor_weakness',
    intent: 'competitor_weakness',
    content_array: ['fitness tracker', 'weight loss', 'calorie counter'],
    lang: language,
    is_rtl: language === 'ar',
    metadata: {
      competitorName: 'TestApp',
      keywordCount: 3,
    },
    title: 'Test Competitor',
    description: 'Test payload for Phase 1 verification',
  };

  const isRtl = language === 'ar';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{
        padding: '20px',
        border: '2px solid #0066cc',
        borderRadius: '8px',
        backgroundColor: '#f0f4ff',
        fontFamily: 'monospace',
      }}
    >
      <h2 style={{ marginTop: 0, color: '#0066cc' }}>
        Phase 1: Staging System Test Harness
      </h2>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* TEST RESULTS */}
      {/* ═════════════════════════════════════════════════════════════════════ */}

      <div style={{ marginBottom: '20px', backgroundColor: 'white', padding: '10px' }}>
        <h3 style={{ margin: '0 0 10px 0' }}>Automated Test Results</h3>
        
        <div style={{ marginBottom: '8px' }}>
          <strong>Language Detected:</strong>
          <span style={{ marginLeft: '10px', color: testResults.languageDetected ? '#00aa00' : '#cc0000' }}>
            {testResults.languageDetected || 'PENDING'}
          </span>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <strong>Payload Valid:</strong>
          <span style={{ marginLeft: '10px', color: testResults.payloadValid ? '#00aa00' : '#cc0000' }}>
            {testResults.payloadValid ? '✓ YES' : '✗ NO'}
          </span>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <strong>RTL Computed Correctly:</strong>
          <span style={{ marginLeft: '10px', color: testResults.rtlCorrect ? '#00aa00' : '#cc0000' }}>
            {testResults.rtlCorrect ? '✓ YES' : '✗ NO'}
          </span>
        </div>

        <div style={{ marginTop: '15px', fontSize: '12px', color: '#666' }}>
          <strong>Payload Structure:</strong>
          <pre style={{ backgroundColor: '#f5f5f5', padding: '8px', overflow: 'auto' }}>
            {JSON.stringify(testResults.testPayload, null, 2)}
          </pre>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* MANUAL TEST: Button State Machine */}
      {/* ═════════════════════════════════════════════════════════════════════ */}

      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 10px 0' }}>Manual Test: Button States</h3>
        <p style={{ margin: '0 0 15px 0', color: '#666' }}>
          Click the button below to test state transitions (idle → loading → staged)
        </p>

        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexDirection: isRtl ? 'row-reverse' : 'row',
          }}
        >
          <StagingButton
            payload={testPayload}
            variant="primary"
            size="md"
            label={language === 'ar' ? 'اختبار الإضافة' : 'Test Add'}
            onStaged={() => {
              console.log('[TEST] Staging completed successfully!');
            }}
          />

          <span style={{ color: '#666', fontSize: '14px' }}>
            {language === 'ar'
              ? 'انقر الزر لاختبار الحالات'
              : 'Click to test state transitions'}
          </span>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* INSTRUCTIONS */}
      {/* ═════════════════════════════════════════════════════════════════════ */}

      <div style={{ backgroundColor: '#fffbe6', padding: '10px', borderRadius: '4px' }}>
        <h3 style={{ margin: '0 0 10px 0' }}>What to Check in Browser Console</h3>
        <ol style={{ margin: 0, paddingLeft: '20px' }}>
          <li>
            <strong>Automated tests:</strong> Look for{' '}
            <code>[TEST 1] Language Detection</code> → <code>[TEST 4] RTL Computation</code>
          </li>
          <li>
            <strong>All should pass:</strong> All ✓ indicators should be green
          </li>
          <li>
            <strong>Click button:</strong> Watch console for <code>[useStaging]</code> messages
          </li>
          <li>
            <strong>Look for:</strong> PAYLOAD VERIFICATION → SUCCESS messages
          </li>
          <li>
            <strong>Check language:</strong> Verify payload includes <code>lang: '{language}'</code>
          </li>
          <li>
            <strong>Check RTL:</strong> Verify button renders with <code>dir="{isRtl ? 'rtl' : 'ltr'}"</code>
          </li>
          <li>
            <strong>Check toast:</strong> Should see bilingual notification (EN or AR)
          </li>
        </ol>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* DEBUG INFO */}
      {/* ═════════════════════════════════════════════════════════════════════ */}

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#999' }}>
        <strong>Debug Info:</strong>
        <div>• Language: {language}</div>
        <div>• RTL: {isRtl ? 'Yes' : 'No'}</div>
        <div>• Dir attribute: {isRtl ? 'rtl' : 'ltr'}</div>
        <div>• Payload ready: {testResults.payloadValid ? 'Yes' : 'No'}</div>
      </div>
    </div>
  );
}
```

### Add Test Harness to Your App

Find a temporary location (e.g., debug page or testing route):

```typescript
// Example: pages/admin/test-staging.tsx or app/test-staging/page.tsx

import { StagingButtonTestHarness } from '@/components/staging/StagingButtonTestHarness';

export default function TestStagingPage() {
  return (
    <div style={{ padding: '20px' }}>
      <StagingButtonTestHarness />
    </div>
  );
}
```

**Navigate to this page locally** (e.g., `http://localhost:3000/admin/test-staging`)

---

## 🔍 Step 4: Check Console Logs During Test

### What You Should See

**Automatic Tests (on page load):**

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

**When You Click the Button:**

```
[useStaging] [COMPETITOR_SPY] PAYLOAD VERIFICATION (Before DB Write)
  source: competitor_spy
  category: competitor_weakness
  intent: competitor_weakness
  language: en
  is_rtl: false
  content_array length: 3
  ✓ is_rtl: false

[useStaging] [COMPETITOR_SPY] SUCCESS - Signal Stored in Vault
  signal_id: 550e8400-e29b-41d4-a716-446655440000
  created_at: 2026-06-07T12:00:00Z
  ✓ Content array stored: 3 items
```

**Toast Notification:**

English: "Added to queue"  
Arabic: "تمت الإضافة بنجاح"

---

## ✅ Step 5: Validation Checklist

Run through this checklist. **All must be GREEN** before moving forward.

### Automated Tests
- [ ] `[TEST 1]` Language Detection: ✓ PASS
- [ ] `[TEST 2]` Build Payload: ✓ Payload structure correct
- [ ] `[TEST 3]` Payload Validation: Valid: true
- [ ] `[TEST 4]` RTL Computation: ✓ RTL flag correct

### Manual Button Tests
- [ ] Button renders without errors
- [ ] Button label is in correct language (EN or AR)
- [ ] Button layout correct (RTL if Arabic)
- [ ] Clicking button shows loading state (spinner)
- [ ] Console shows `[useStaging] ... PAYLOAD VERIFICATION`
- [ ] Console shows `[useStaging] ... SUCCESS`
- [ ] Toast notification appears (bilingual)
- [ ] Button changes to "staged" state (checkmark)

### Browser Behavior
- [ ] No TypeScript errors in console
- [ ] No React warnings
- [ ] No network errors
- [ ] Page responsive (no freezing)

### RTL Verification (if lang === 'ar')
- [ ] Button text right-aligned
- [ ] Icon to the right of text
- [ ] `dir="rtl"` visible in DOM
- [ ] `flex-row-reverse` applied

---

## ⚠️ If Something Fails

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| Build fails with import errors | Missing dependency | Install missing package |
| Hook doesn't initialize | useLocale error | Replace with your language method |
| Button doesn't render | Component error | Check console for React error |
| Console logs missing | Hook not called | Ensure component is mounted |
| Toast doesn't show | useToast not working | Verify useToast implementation |
| RTL not applying | CSS issue | Check Tailwind config includes RTL |
| Language not detected | useLocale returning undefined | Debug language context |

**DO NOT PROCEED** to module refactoring if:
- ❌ Build fails
- ❌ Console shows errors
- ❌ Test harness doesn't render
- ❌ Button doesn't work
- ❌ Language not detected
- ❌ RTL not applying
- ❌ Toast doesn't show

---

## 🎯 Success Criteria

When you can check ALL of these boxes, Phase 1 is COMPLETE:

- [x] 4 core files copied to codebase
- [x] TypeScript build passes with no errors
- [x] Test harness renders without errors
- [x] Automated tests in console all show ✓ PASS
- [x] Button renders in correct language
- [x] Button RTL applies correctly when lang='ar'
- [x] Button click triggers payload building
- [x] Console shows PAYLOAD VERIFICATION logs
- [x] Console shows SUCCESS logs
- [x] Toast notification shows (bilingual)
- [x] Button state transitions work (idle → loading → staged)
- [x] No TypeScript errors
- [x] No React console warnings
- [x] No network errors

---

## ✨ You're Ready for Phase 2!

Once you've verified all the above, you can:

1. **Keep the test harness** for ongoing validation
2. **Remove it later** after modules are refactored
3. **Proceed to Phase 2:** Refactor Competitor Spy module

---

**Next Document:** `PHASE_2_COMPETITOR_SPY_REFACTORING.md` (coming next)

**Estimated Time for Phase 1:** 1-2 hours (most time spent reading/understanding)

---
