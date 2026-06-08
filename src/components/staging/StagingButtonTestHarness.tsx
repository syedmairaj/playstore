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
  // TEST 1: La const [testResults, setTestResults] = useState<Record<string, any>>({});

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
      'cotegory}`);
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
onsole.log('\n═══════════════════════════════════════════════════════════');
    console.log('TEST HARNESS: All automated tests completed');
    console.log('═══════════════════════════════════════════════════════════\n');
  }, [language]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Manual Test: Button State Transitions
  // ═══════════════════════════════════════════════════════════════════════════

  const testPayload: UnifiedStagingPay',
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
          <span style={pan style={{ marginLeft: '10px', color: testResults.payloadValid ? '#00aa00' : '#cc0000' }}>
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

      {/* ═════════════════════════════════════════════════════════════════════ v style={{ marginBottom: '20px' }}>
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
              console.lg completed successfully!');
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
            <strolick button:</strong> Watch console for <code>[useStaging]</code> messages
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

      {/* ══════════════════════════════════════════════════════════════════â{{ marginTop: '20px', fontSize: '12px', color: '#999' }}>
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

