# 🚀 Implementation Guide - Tasks 1, 2, 3

**Objective:** Fix staging regression (403/Empty Vault), enhance UX with keyword tooltip, add success states  
**Status:** ✅ Ready for Integration

---

## Task 1: Unified Staging Fix Refactor

### Problem
- Various modules (Competitor Spy, etc.) failing with 403/Empty Vault errors
- Different modules calling API with incomplete/invalid payloads
- No module-specific error logging for debugging
- Missing metadata validation before sending

### Solution
Created `StageButtonRefactored.tsx` which:
1. ✅ Uses `stageSignal` utility (single source of truth)
2. ✅ Validates all payload fields BEFORE submission
3. ✅ Includes module-specific error logs
4. ✅ Shows Loading → Success → Idle state transitions
5. ✅ Passes metadata as proper JSON object
6. ✅ Handles missing sourceAppId gracefully

### Files Created
- `components/staging/StageButtonRefactored.tsx` (240 lines)

### How to Implement

#### Step 1: Replace StageButton imports in Competitor Spy
```typescript
// OLD
import { StageButton } from "@/components/staging/StageButton";

// NEW
import { StageButtonRefactored } from "@/components/staging/StageButtonRefactored";
```

#### Step 2: Update component usage in `competitor-spy-snapshot-card.tsx`

**Before:**
```typescript
<StageButton
  signalType="competitor_weakness"
  content={`${competitorDisplayName}: ${liveTitle || displayName}`}
  source="competitor_spy"
  sourceContext="competitor_weakness"
  sourceContextId={packageId}
  workspaceId={workspaceId}
  sourceAppId={appId}
  language={isRtl ? "ar" : "en"}
  metadata={{
    competitorName: competitorDisplayName,
    competitorPackageId: packageId,
    categoryLabel,
    bestRank,
    metricsKeywordCount,
  }}
  variant="primary"
  size="md"
  className="w-full sm:flex-1"
  label={t("sendOptimizer")}
/>
```

**After:**
```typescript
<StageButtonRefactored
  module="competitor_spy"  // ← NEW: Module identifier for logging
  signalType="competitor_weakness"
  content={`${competitorDisplayName}: ${liveTitle || displayName}`}
  source="competitor_spy"
  sourceContext="competitor_weakness"
  sourceContextId={packageId}
  workspaceId={workspaceId}
  sourceAppId={appId}
  language={isRtl ? "ar" : "en"}
  metadata={{
    competitorName: competitorDisplayName,
    competitorPackageId: packageId,
    categoryLabel,
    bestRank,
    metricsKeywordCount,
  }}
  variant="primary"
  size="md"
  className="w-full sm:flex-1"
  label={t("sendOptimizer")}
/>
```

#### Step 3: Repeat for all 6 modules

| Module | File | Component |
|--------|------|-----------|
| Common Issues | `components/reviews/IssueCard.tsx` | Replace `StageButton` with `StageButtonRefactored` |
| Keyword Tracker | `components/keyword-tracker/*.tsx` | Replace custom button with `StageButtonRefactored` |
| Competitor Spy | `components/competitor-spy/competitor-spy-snapshot-card.tsx` | ✅ Already shown above |
| Market Intel | `components/market/MarketIntelligenceClient.tsx` | Replace `StageButton` with `StageButtonRefactored` |
| Alerts | TBD | TBD |
| Spotlight | TBD | TBD |

### Error Logging Output

When staging fails, you'll see module-specific errors in console:

```javascript
[StageButton] [COMPETITOR_SPY] Validation Error: Missing sourceContextId
[StageButton] Payload: {
  workspaceId: "e8408dba-...",
  signalType: "competitor_weakness",
  sourceContext: "competitor_weakness",
  sourceContextId: "com.competitor.app",  // ← Shows exactly what's missing
  contentLength: 45,
  metadata: { ... }
}

// If insert fails:
[StageButton] [COMPETITOR_SPY] FAILED: {
  error: "Database insert failed: ...",
  workspace_id: "e8408dba-...",
  signal_type: "competitor_weakness",
  source_context: "competitor_weakness",
  source_context_id: "com.competitor.app"
}
```

---

## Task 2: ASO/UX Enhancement - Keyword Surfaces Tooltip

### Problem
Static `12 terms` badge with no visibility into which keywords they are  
Users can't see keyword strategies or copy them

### Solution
Created `KeywordSurfacesPopover.tsx` with:
1. ✅ Radix UI Popover for accessibility
2. ✅ Keywords grouped by strategy (High-Volume, Intent-Based, Competitor Gap)
3. ✅ Click-to-copy functionality with visual feedback
4. ✅ Full EN/AR localization
5. ✅ RTL-aware positioning
6. ✅ Smooth animations

### Files Created
- `components/competitor-spy/keyword-surfaces-popover.tsx` (280 lines)

### How to Implement

#### Step 1: Install Radix UI Popover (if not installed)
```bash
npm install @radix-ui/react-popover
```

#### Step 2: Replace the static "12 terms" badge in Competitor Spy

**Location:** Look for the "KEYWORD SURFACES" section in the snapshot card

**Before:**
```tsx
<div className="rounded-xl border border-white/[0.06] bg-[#070a0f] px-3 py-2.5 text-start">
  <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
    {t("metricsLabel")}
  </dt>
  <dd className="mt-1 text-base font-semibold text-zinc-100">
    {t("metricsValue", { count: 12 })}  {/* ← Static badge */}
  </dd>
</div>
```

**After:**
```tsx
import { KeywordSurfacesPopover } from "@/components/competitor-spy/keyword-surfaces-popover";

<div className="rounded-xl border border-white/[0.06] bg-[#070a0f] px-3 py-2.5 text-start">
  <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
    {t("metricsLabel")}
  </dt>
  <dd className="mt-1">
    <KeywordSurfacesPopover
      keywords={[
        "fitness tracker",
        "calorie counter",
        "workout planner",
        "weight loss",
        "step counter",
        "meal tracker",
        "food scanner app",
        "diet goals app",
        "nutrition tracking app",
        "health data tracker",
        "salt sugar tracker",
        "glucose monitor app",
      ]}
      count={12}
      isRtl={isRtl}
    />
  </dd>
</div>
```

#### Step 3: Get Keywords from API

If keywords come from API (e.g., `snapshot.keywords`):

```tsx
<KeywordSurfacesPopover
  keywords={snapshot.trendingKeywords || []}
  groupedKeywords={[
    {
      strategy: "high_volume",
      keywords: snapshot.highVolumeKeywords || [],
    },
    {
      strategy: "intent_based",
      keywords: snapshot.intentBasedKeywords || [],
    },
    {
      strategy: "competitor_gap",
      keywords: snapshot.competitorGapKeywords || [],
    },
  ]}
  count={snapshot.keywordCount || 0}
  isRtl={isRtl}
/>
```

### Localization

The component automatically handles EN/AR:
- English: "Keyword Surfaces" with left-align popover
- Arabic: "سطح الكلمات المفتاحية" with right-align popover
- Strategy labels automatically translated
- Copy-to-clipboard hint in appropriate language

---

## Task 3: Success State & Visual Validation

### Problem
- Silent failures - no visual feedback when staging completes
- Users can't tell if data was actually inserted
- Need database confirmation visible in UI

### Solution
`StageButtonRefactored` includes 4-state system:
1. **Idle** (default) - Normal button with label
2. **Loading** - Spinner + "Staging..." text
3. **Success** - ✓ Checkmark + "Staged" (green, 2 sec)
4. **Error** - ⚠ AlertCircle + "Failed" (red, 2 sec)

### Implementation

The refactored button automatically shows:

```
User clicks button
    ↓
[Saving... spinner appears]  ← Visual feedback they clicked
    ↓
[API call to stageSignal with validation]
    ↓
Success: [✓ Staged] (green)  ← Confirms INSERT worked
    ↓
[Auto-reset to idle after 2 sec]

OR

Failure: [⚠ Failed] (red)  ← Shows something broke
    ↓
Error toast with specific message
    ↓
[Auto-reset to idle after 2 sec]
```

### Visual States

**Idle State:**
```
┌─────────────────────────┐
│  Send to AI Listing Optimizer  >  │
└─────────────────────────┘
```

**Loading State:**
```
┌─────────────────────────┐
│  ⟳ Staging...           │
└─────────────────────────┘
```

**Success State (2 seconds):**
```
┌─────────────────────────┐
│  ✓ Staged               │
└─────────────────────────┘
```

**Error State (shows until dismissed):**
```
┌─────────────────────────┐
│  ⚠ Failed               │
└─────────────────────────┘
```

### Database Verification

After you see the ✓ checkmark, the INSERT should be in database:

```sql
SELECT id, signal_type, source_context, content, created_at
FROM workspace_staging_vault
WHERE source_context = 'competitor_weakness'
  AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 1;
```

If you see a row:
```
id              | signal_type           | source_context        | content                | created_at
abc-123-def     | competitor_weakness   | competitor_weakness   | Blood Sugar Tracker... | 2024-01-15 14:32:15
```

Then ✅ **the signal was successfully staged**.

---

## Quick Start Checklist

### For Each Module:

- [ ] **Step 1:** Import `StageButtonRefactored` instead of `StageButton`
- [ ] **Step 2:** Add `module="module_name"` prop to button
- [ ] **Step 3:** Ensure all required props are passed:
  - `signalType` (keyword | review_issue | competitor_weakness | optimization_insight)
  - `content` (non-empty string)
  - `source` (module source)
  - `sourceContext` (context type)
  - `sourceContextId` (context ID)
  - `workspaceId` (workspace UUID)
  - `metadata` (optional but recommended)
- [ ] **Step 4:** Test and watch console for `[StageButton] [MODULE_NAME]` logs
- [ ] **Step 5:** Verify checkmark appears and signal appears in database

### For Keyword Surfaces Tooltip:

- [ ] Install Radix UI Popover if needed
- [ ] Import `KeywordSurfacesPopover` component
- [ ] Replace static badge with dynamic component
- [ ] Pass `keywords` array, `count`, and `isRtl`
- [ ] Test in both English and Arabic
- [ ] Verify click-to-copy works

---

## Error Scenarios & Debugging

### Scenario 1: Validation Error

**Console:**
```
[StageButton] [COMPETITOR_SPY] Validation Error: Missing sourceContextId
```

**Fix:** Check that `sourceContextId` prop is passed and non-empty

### Scenario 2: Database Insert Failed

**Console:**
```
[StageButton] [COMPETITOR_SPY] FAILED: Database insert failed: permission denied
```

**Cause:** User not in workspace or workspace doesn't exist  
**Fix:** Check `workspace_members` table for user entry

### Scenario 3: Invalid UUID in sourceAppId

**Console:**
```
[StageButton] [COMPETITOR_SPY] Validation Error: Invalid sourceAppId format
```

**Fix:** Only pass UUID format (or undefined):
```typescript
// ❌ WRONG
sourceAppId={appId || ""}  // Empty string fails validation

// ✅ RIGHT
sourceAppId={appId}  // Let it be undefined if not available
```

### Scenario 4: Empty Metadata

**Console:**
```
[StageButton] [COMPETITOR_SPY] Staging request: {
  ...
  has_metadata: false  // ← Metadata is empty
}
```

**Expected:** Some metadata should be passed. Example:
```typescript
metadata={{
  competitorName: "Competitor App",
  severity: "high",
  bestRank: 5,
}}
```

---

## Testing Workflow

1. **Open competitor spy page**
2. **Click "Send to AI Listing Optimizer"**
3. **Watch button states:**
   - Spinner appears → good sign fetch started
   - ✓ Checkmark → signal was staged
4. **Check database:**
   ```sql
   SELECT COUNT(*) FROM workspace_staging_vault
   WHERE source_context = 'competitor_weakness'
   AND created_at > NOW() - INTERVAL '5 minutes';
   ```
5. **Check console for module-specific logs:**
   ```
   [StageButton] [COMPETITOR_SPY] Success: {
     id: "...",
     signal_type: "competitor_weakness",
     source_context: "competitor_weakness"
   }
   ```

---

## Migration Path (Gradual Rollout)

### Phase 1: Competitor Spy (Highest Priority)
- [ ] Replace StageButton with StageButtonRefactored
- [ ] Add KeywordSurfacesPopover to snapshot card
- [ ] Test in prod with small set of users
- [ ] Verify success rates and error logs

### Phase 2: Reviews (Common Issues)
- [ ] Replace StageButton in IssueCard
- [ ] Test with both EN/AR
- [ ] Verify metadata passing

### Phase 3: Keyword Tracker
- [ ] Migrate custom button to StageButtonRefactored
- [ ] Add proper metadata
- [ ] Test success states

### Phase 4: Market Intel & Others
- [ ] Apply same pattern
- [ ] Full testing
- [ ] Remove old StageButton once all migrated

---

## Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `StageButtonRefactored.tsx` | 240 | Unified staging button with validation & success states |
| `KeywordSurfacesPopover.tsx` | 280 | Popover tooltip for keyword display with localization |
| `stageSignal.ts` | 485 | Backend validation utility (already exists) |

---

**All three tasks are ready for implementation. Start with Competitor Spy module first to validate the pattern, then roll out to other modules.**
