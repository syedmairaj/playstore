
# Phase 2: Competitor Spy Module Refactoring (Safe Transition)
**Status:** Ready After Phase 1 Completion  
**Duration:** 2-3 hours  
**Objective:** Refactor Competitor Spy WITHOUT breaking existing functionality  
**Safety Strategy:** Parallel implementation → test → switch → remove old code

---

## ⚠️ Safety-First Philosophy

You will **NOT** delete old code immediately. Instead:

1. **Implement new code** alongside old code
2. **Test both versions** work identically
3. **Compare outputs** to ensure same behavior
4. **Switch to new version** when confident
5. **Delete old code** after 1 week of production monitoring

This prevents "rip-and-replace" disasters.

---

## 🎯 Phase 2 Overview

### What You'll Change
| Component | Old | New | Impact |
|-----------|-----|-----|--------|
| Payload building | Manual JSON construction | `buildCompetitorSpyPayload()` | Same behavior |
| Staging button | `StageButtonRefactored` | `StagingButton` | Same behavior + better UX |
| State management | Custom useState | `useStaging()` hook | Same behavior |
| Language detection | Manual prop passing | `useLocale()` | Automatic |
| RTL support | Manual className logic | Built into hook/button | Automatic |

### What Won't Change
- ✅ Database schema (same `workspace_staging_vault` table)
- ✅ API endpoint (same `/api/workspaces/staging/add`)
- ✅ Data flow (same payload structure)
- ✅ User experience (better, not different)

---

## 🔄 Step 1: Locate Competitor Spy Module

### Find the File

```bash
# Look for competitor spy snapshot card
find src -name "*competitor*" -type f | grep -E "\.(tsx|ts|jsx)$"

# Common locations:
# src/components/competitor-spy/competitor-spy-snapshot-card.tsx
# src/components/competitor-spy/index.tsx
# src/pages/modules/competitor-spy.tsx
```

**Save the exact path.** You'll reference it multiple times.

### Backup the File

```bash
# Create backup before making changes
cp src/components/competitor-spy/competitor-spy-snapshot-card.tsx \
   src/components/competitor-spy/competitor-spy-snapshot-card.tsx.backup

# Verify backup exists
ls -la src/components/competitor-spy/competitor-spy-snapshot-card.tsx.backup
```

---

## 🔍 Step 2: Analyze Current Implementation

### Read Your Current Code

Open `competitor-spy-snapshot-card.tsx` and understand:

1. **How payload is currently built** (look for object construction)
2. **What fields are in metadata** (save this list)
3. **How StageButtonRefactored is called** (note all props)
4. **How language is currently handled** (prop? context? const?)
5. **Where RTL logic is** (className? style? attribute?)

### Extract Key Data

Create a document like this:

```typescript
// CURRENT COMPETITOR SPY IMPLEMENTATION

// 1. Current Payload Structure:
// content field contains:
{
  "competitor_name": "...",
  "app_title": "...",
  "keywords": [...]
}

// metadata field contains:
{
  "competitorName": "...",
  "keywords": [...],
  "keywordCount": 12,
  // ... other fields
}

// 2. StageButtonRefactored Props Currently Used:
{
  signalType: "competitor_weakness",
  content: JSON.stringify(...),
  source: "competitor_spy",
  sourceContext: "competitor_weakness",
  sourceContextId: competitorPackageId,
  metadata: {...},
  language: language,  // or however it's currently passed
  // ... other props
}

// 3. Language Detection Currently:
// Method: useLocale() | prop | const | other?
// Default: 'en' | 'ar' | fallback?

// 4. RTL Currently Applied:
// Location: button className? container style? where?
// Logic: isRtl = [...].includes(language)?
```

**Save this information.** You'll use it to verify the new version produces identical results.

---

## 🔀 Step 3: Parallel Implementation Strategy

### Create New Version (Alongside Old)

You'll keep both implementations in the file temporarily:

```typescript
// ============================================================================
// OLD IMPLEMENTATION (Keep for now)
// ============================================================================
function StageCompetitorSpyOld() {
  // ... existing code ...
}

// ============================================================================
// NEW IMPLEMENTATION (Staged rollout)
// ============================================================================
function StageCompetitorSpyNew() {
  // ... new code using useStaging hook ...
}

// ============================================================================
// EXPORT (Start with old, will switch to new)
// ============================================================================
export const StageCompetitorSpy = StageCompetitorSpyOld; // ← Switch this line when ready
```

### Benefit of Parallel Implementation

- ✅ Can test both at the same time
- ✅ Can compare outputs in database
- ✅ Can revert instantly if issues
- ✅ Can run A/B tests if needed
- ✅ Confidence grows before full switch

---

## 💻 Step 4: Write New Implementation

### Inside `competitor-spy-snapshot-card.tsx`

Add this new code (keep old code as-is):

```typescript
'use client';

// ============================================================================
// EXISTING IMPORTS (Keep these)
// ============================================================================
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
// ... other existing imports ...

// ============================================================================
// NEW IMPORTS (Add these)
// ============================================================================
import { StagingButton } from '@/components/staging/StagingButton';
import { buildCompetitorSpyPayload } from '@/lib/staging-utilities';
import type { LanguageCode, UnifiedStagingPayload } from '@/types/staging-contract';

// ============================================================================
// NEW IMPLEMENTATION
// ============================================================================

/**
 * NEW: Competitor Spy Snapshot Card - Refactored Version
 * 
 * Uses unified staging system:
 * - useStaging hook instead of custom logic
 * - StagingButton instead of StageButtonRefactored
 * - Automatic language detection
 * - Automatic RTL rendering
 */
export function CompetitorSpySnapshotCardNew({
  workspaceId,
  appId,
  competitor,
  myAppName,
  keywords,
}: {
  workspaceId: string;
  appId: string;
  competitor: {
    name: string;
    packageId: string;
    category: string;
    ranking: number;
  };
  myAppName: string;
  keywords: string[];
}) {
  // ═════════════════════════════════════════════════════════════════════════
  // 1. LANGUAGE DETECTION (Automatic)
  // ═════════════════════════════════════════════════════════════════════════
  
  const language = useLocale() as LanguageCode;
  const t = useTranslations('competitor-spy');

  // ═════════════════════════════════════════════════════════════════════════
  // 2. BUILD PAYLOAD (Using new builder function)
  // ═════════════════════════════════════════════════════════════════════════

  const stagingPayload: UnifiedStagingPayload = buildCompetitorSpyPayload(
    competitor.name,
    keywords,
    {
      competitorPackageId: competitor.packageId,
      categoryLabel: competitor.category,
      bestRank: competitor.ranking,
      myAppName,
    },
    language
  );

  // ═════════════════════════════════════════════════════════════════════════
  // 3. LOCAL STATE (if needed, e.g., for expanding keywords)
  // ═════════════════════════════════════════════════════════════════════════

  const [showKeywords, setShowKeywords] = useState(false);

  // ═════════════════════════════════════════════════════════════════════════
  // 4. HANDLERS
  // ═════════════════════════════════════════════════════════════════════════

  const handleOpenPlayStore = () => {
    const url = `https://play.google.com/store/apps/details?id=${competitor.packageId}`;
    window.open(url, '_blank');
  };

  const handleToggleKeywords = () => {
    setShowKeywords(!showKeywords);
  };

  const handleStagingComplete = () => {
    // Optional: Do something after signal is staged
    console.log('[CompetitorSpy] Signal staged successfully');
  };

  // ═════════════════════════════════════════════════════════════════════════
  // 5. RENDER
  // ═════════════════════════════════════════════════════════════════════════

  const isRtl = language === 'ar';

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className={cn(
        'border rounded-lg p-4 bg-white shadow-sm',
        'hover:shadow-md transition-shadow'
      )}
    >
      {/* HEADER */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-base text-gray-900">
            {competitor.name}
          </h3>
          <p className="text-sm text-gray-600">
            {competitor.category} • Rank #{competitor.ranking}
          </p>
        </div>
      </div>

      {/* KEYWORDS SECTION (Optional: keep your existing UI or use new) */}
      <div className="mb-4 bg-gray-50 rounded p-3">
        <div
          onClick={handleToggleKeywords}
          className="flex items-center justify-between cursor-pointer"
        >
          <span className="text-sm font-medium text-gray-700">
            {t('keywords')}: {keywords.length}
          </span>
          <span className={cn('transition-transform', showKeywords && 'rotate-180')}>
            ▼
          </span>
        </div>

        {showKeywords && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {keywords.map((keyword, idx) => (
              <div
                key={idx}
                className="text-xs bg-white rounded p-2 border hover:bg-blue-50"
              >
                {keyword}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ACTION BUTTONS */}
      <div
        className={cn(
          'flex items-center gap-2',
          isRtl && 'flex-row-reverse'
        )}
      >
        {/* Button 1: Open in Play Store (unchanged) */}
        <button
          onClick={handleOpenPlayStore}
          className={cn(
            'px-3 py-2 text-sm rounded',
            'bg-gray-100 hover:bg-gray-200 text-gray-900',
            'border border-gray-300',
            'transition-colors'
          )}
        >
          {t('openPlayStore')}
        </button>

        {/* Button 2: NEW - Unified Staging Button */}
        <StagingButton
          payload={stagingPayload}
          variant="primary"
          size="sm"
          onStaged={handleStagingComplete}
          label={language === 'ar' ? t('addToQueue_ar') : t('addToQueue')}
        />
      </div>

      {/* FOOTER */}
      <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
        <p>
          {t('comparingWith')}: <span className="font-medium">{myAppName}</span>
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// OLD IMPLEMENTATION (Keep for now - will delete after testing)
// ============================================================================

export function CompetitorSpySnapshotCardOld({
  workspaceId,
  appId,
  competitor,
  myAppName,
  keywords,
}: {
  workspaceId: string;
  appId: string;
  competitor: {
    name: string;
    packageId: string;
    category: string;
    ranking: number;
  };
  myAppName: string;
  keywords: string[];
}) {
  // ... KEEP YOUR EXISTING IMPLEMENTATION AS-IS ...
  // This way you can test both side-by-side
}

// ============================================================================
// EXPORT SWITCH (Start with old, switch to new when ready)
// ============================================================================

export const CompetitorSpySnapshotCard = CompetitorSpySnapshotCardNew;
// After testing, change to: CompetitorSpySnapshotCardNew
// Can quickly revert: CompetitorSpySnapshotCardOld
```

---

## ✅ Step 5: Test Both Versions Side-by-Side

### Create A/B Test Component

```typescript
// pages/admin/competitor-spy-ab-test.tsx

import { CompetitorSpySnapshotCardNew } from '@/components/competitor-spy/competitor-spy-snapshot-card';
import { CompetitorSpySnapshotCardOld } from '@/components/competitor-spy/competitor-spy-snapshot-card';

export default function CompetitorSpyABTest() {
  const testData = {
    workspaceId: 'test-workspace-id',
    appId: 'test-app-id',
    competitor: {
      name: 'FitTrack Pro',
      packageId: 'com.fittrack.pro',
      category: 'Health & Fitness',
      ranking: 42,
    },
    myAppName: 'HealthHub',
    keywords: [
      'fitness tracker',
      'calorie counter',
      'workout planner',
      'weight loss',
      'step counter',
      'meal tracker',
      'food scanner app',
      'diet goals app',
      'nutrition tracking',
      'health monitoring',
      'exercise routine',
      'activity tracker',
    ],
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Competitor Spy A/B Test</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* OLD VERSION */}
        <div style={{ border: '2px solid red', padding: '10px' }}>
          <h2 style={{ color: 'red', marginTop: 0 }}>OLD (Current)</h2>
          <CompetitorSpySnapshotCardOld {...testData} />
        </div>

        {/* NEW VERSION */}
        <div style={{ border: '2px solid green', padding: '10px' }}>
          <h2 style={{ color: 'green', marginTop: 0 }}>NEW (Refactored)</h2>
          <CompetitorSpySnapshotCardNew {...testData} />
        </div>
      </div>

      <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f5f5f5' }}>
        <h3>Testing Instructions:</h3>
        <ol>
          <li>Open browser DevTools (F12) → Console tab</li>
          <li>Click "Add to Queue" on OLD version</li>
          <li>Check console for logs</li>
          <li>Check database for signal created</li>
          <li>Click "Add to Queue" on NEW version</li>
          <li>Check console for logs</li>
          <li>Check database for signal created</li>
          <li>Compare payloads - should be identical</li>
          <li>Compare database records - should look the same</li>
        </ol>
      </div>
    </div>
  );
}
```

### What to Compare

| Aspect | Old Output | New Output | Should Match? |
|--------|-----------|-----------|---|
| Console logs | [StageButton] messages | [useStaging] messages | ✓ Same structure |
| Payload content | JSON in console | JSON in console | ✓ Identical |
| Database: content field | [...keywords...] | [...keywords...] | ✓ Same |
| Database: metadata field | { ... } | { ... } | ✓ Same |
| Database: language field | 'en' or 'ar' | 'en' or 'ar' | ✓ Same |
| Button appearance | Style/position | Style/position | ✓ Same |
| Button state transitions | idle→loading→staged | idle→loading→staged | ✓ Same |
| Toast notification | "Successfully staged" | "Added to queue" | ✓ Same message |
| RTL rendering | RTL if ar | RTL if ar | ✓ Same |

---

## 🔄 Step 6: Switch to New Version

### When You're Confident

Change the export line:

```typescript
// BEFORE:
export const CompetitorSpySnapshotCard = CompetitorSpySnapshotCardOld;

// AFTER:
export const CompetitorSpySnapshotCard = CompetitorSpySnapshotCardNew;
```

That's it! One line change. Entire module now uses new system.

### Monitor for Issues

After switching, for **1 week**, monitor:

```bash
# Check logs daily:
# 1. Browser console: [useStaging] messages appear correctly?
# 2. Database: New signals have language field?
# 3. Vault page: Signals appear with metadata?
# 4. AI Optimizer: Can retrieve signals correctly?
# 5. Error tracking: Any new errors?
```

---

## 🗑️ Step 7: Clean Up Old Code (After 1 Week)

Once you're confident the new version works:

```typescript
// Delete the old implementation function entirely
// Delete the A/B test page

// Final result:
export function CompetitorSpySnapshotCard({
  // ... props ...
}) {
  // ... new implementation only ...
}
```

### Commit This Change

```bash
git add src/components/competitor-spy/competitor-spy-snapshot-card.tsx
git commit -m "refactor: competitor spy module uses unified staging system

- Replace StageButtonRefactored with StagingButton
- Use useStaging hook instead of custom logic
- Use buildCompetitorSpyPayload builder function
- Automatic language detection via useLocale
- Automatic RTL support
- Remove old implementation (tested for 1 week)
- Identical functionality, better maintainability"
git push origin main
```

---

## 🧪 Validation Checklist

### After switching to new version, verify:

**Functional Tests**
- [ ] Button renders (same appearance)
- [ ] Button has correct language (EN/AR)
- [ ] RTL layout correct if Arabic
- [ ] Clicking button shows loading state
- [ ] Button transitions to "staged" state
- [ ] Toast notification appears (bilingual)

**Database Verification**
```sql
-- Check recent signals
SELECT 
  id, 
  signal_type, 
  source, 
  language,
  metadata::text
FROM workspace_staging_vault
WHERE source = 'competitor_spy'
ORDER BY created_at DESC
LIMIT 5;

-- Verify language field is populated
-- Verify metadata contains expected fields
```

**Console Log Verification**
- [ ] `[useStaging] [COMPETITOR_SPY] PAYLOAD VERIFICATION` appears
- [ ] `language: 'en'` or `language: 'ar'` shown
- [ ] `is_rtl: true/false` shown correctly
- [ ] `[useStaging] [COMPETITOR_SPY] SUCCESS` message appears
- [ ] No error messages in console

**User Experience Tests**
- [ ] English user: All UI in English
- [ ] Arabic user: All UI in Arabic, RTL layout
- [ ] Signal appears in Vault page
- [ ] Signal appears in AI Optimizer
- [ ] No page reload after staging
- [ ] No console errors or warnings

---

## ⚠️ Rollback Plan (If Issues)

If something breaks after switching:

```typescript
// 1. Revert to old version instantly:
export const CompetitorSpySnapshotCard = CompetitorSpySnapshotCardOld;

// 2. Redeploy
// 3. Investigate issue

// 4. Fix in new implementation
// 5. Re-test
// 6. Switch again
```

This takes **seconds**. No downtime. Keep the old code for 2+ weeks for safety.

---

## 📊 Success Criteria

Phase 2 is complete when:

- [x] New implementation written alongside old
- [x] A/B test page created and tested
- [x] Both versions produce identical results
- [x] Database records look the same
- [x] Console logs show expected messages
- [x] Language detection works (EN/AR)
- [x] RTL rendering works
- [x] Switched to new version (1 line change)
- [x] Monitored for 1 week without issues
- [x] Old code removed
- [x] No TypeScript errors
- [x] No React warnings
- [x] No console errors

---

## 🎯 Next Steps

After Phase 2:

1. **Phase 3:** Refactor remaining modules (Review Insights, Market Intelligence, Keyword Tracker, Alerts)
2. **Phase 4:** Update AI Optimizer retrieval logic with language filtering
3. **Phase 5:** Full E2E testing (EN/AR)
4. **Phase 6:** Deploy to production

---

**Estimated Time for Phase 2:** 2-3 hours (most time spent testing/monitoring)

**Next Document:** `PHASE_3_MODULE_REFACTORING.md` (coming next)

---
