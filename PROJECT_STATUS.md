# Project Status & Technical Documentation

**Last Updated:** 2026-06-04  
**Status:** Staging Vault Frontend Refactor Complete  
**Branches:** main

---

## Executive Summary

Completed comprehensive frontend refactor replacing legacy navigation-based signal staging with persistent Staging Vault integration across all five major modules (Reviews, Market Intelligence, Competitor Spy, Keyword Tracker, Alerts). System now uses centralized context storage in `workspace_staging_vault` table instead of URL parameters, enabling better UX with visual feedback, metadata preservation, and RTL/LTR localization support.

---

## Phase Overview

### Phase 1: Foundation (Completed)
- Reviews Module - IssueCard.tsx
- Market Intelligence - MarketIntelligenceClient.tsx
- Competitor Spy - competitor-spy-snapshot-card.tsx

### Phase 2: Remaining Modules (Completed - This Session)
- Keyword Tracker - KeywordTrackerClient.tsx
- Alerts - AlertsPanel.tsx

**Status: 100% Complete** ✅

---

## Technical Architecture

### Core Concept: Staging Vault System

**Problem Solved:**
- Old system used URL navigation (`router.push()`) to stage signals
- Lost context on navigation
- No visual feedback to user
- Metadata scattered across different mechanisms

**Solution:**
Persistent server-side storage with client-side state management:

```
User Action → StageButton Component
    ↓
POST /api/workspaces/{id}/staging/add
    ↓
Server: Store in workspace_staging_vault table
    ↓
Client: Visual feedback (loading → checkmark)
    ↓
User sees "Staged" confirmation without navigation
```

### API Contract

**Endpoint:** `POST /api/workspaces/{id}/staging/add`

**Request Body:**
```json
{
  "signalType": "keyword|review_issue|competitor_weakness|optimization_insight",
  "content": "Primary signal content",
  "source": "source identifier",
  "sourceAppId": "app id",
  "sourceContext": "context type (optional)",
  "sourceContextId": "context id (optional)",
  "language": "en|ar|...",
  "metadata": {
    "JSONB fields preserve all context"
  }
}
```

### Signal Types & Sources

| Signal Type | Source | Metadata Captured | Use Case |
|-------------|--------|-------------------|----------|
| `keyword` | `keyword_tracker` | countryCode, currentRank, previousRank, searchVolume, difficulty, market | Keywords from tracker |
| `review_issue` | `review_analysis` | description, severity, impactPercent, quote | Review problems |
| `competitor_weakness` | `competitor_spy` | competitorName, competitorPackageId, categoryLabel, bestRank, metricsKeywordCount | Competitor insights |
| `optimization_insight` | `api` (with sourceContext=`alert`) | alertType, alertTitle, severity, highPriority, detectedAt | Alert anomalies |

---

## Components Architecture

### 1. StageButton (Existing - Phase 1)
**Location:** `components/staging/StageButton.tsx`  
**Purpose:** Generic reusable button for any signal type  
**Props:** signalType, content, source, metadata, language, variant, size, label  
**State Flow:** idle → loading → staged

### 2. KeywordTrackerStagingButton (New - Phase 2)
**Location:** `components/keyword-tracker/KeywordTrackerStagingButton.tsx`  
**Size:** ~170 lines  
**Purpose:** Specialized button for keyword staging with rank context  

**Props:**
```typescript
{
  workspaceId: string;           // Required
  appId: string;                 // Required
  keyword: string;               // The keyword to stage
  currentRank?: number;          // Current position
  previousRank?: number;         // Previous position
  searchVolume?: number;         // Search volume data
  difficulty?: number;           // Keyword difficulty
  market?: string;               // Country code (us, uk, etc)
  language?: string;             // "en", "ar", etc
  onStaged?: () => void;         // Callback after success
  variant?: "primary"|"secondary"|"ghost";
  size?: "sm"|"md"|"lg";
  className?: string;            // Additional styling
  label?: string;                // Custom button text
}
```

**Key Features:**
- RTL auto-detection: `["ar", "he", "fa", "ur"]`
- Dual language text (English/Arabic)
- Metadata: countryCode, currentRank, previousRank, searchVolume, difficulty, market
- Toast notifications with success/error handling
- Graceful error messages in user's language

**Integration Location:**
- File: `components/keyword-tracker/KeywordTrackerClient.tsx`
- Section: AI Suggested Keywords (lines ~1316-1325)
- Layout: Flex container with Track button (RTL-aware flex-row-reverse)

### 3. AlertsStagingButton (New - Phase 2)
**Location:** `components/alerts/AlertsStagingButton.tsx`  
**Size:** ~200 lines  
**Purpose:** Specialized button for alert staging with severity-based styling  

**Props:**
```typescript
{
  workspaceId: string;           // Required
  appId: string;                 // Required
  alertId: string;               // Alert identifier
  alertType: string;             // keyword_rank_drop, sentiment_shift, etc
  alertTitle: string;            // User-friendly title
  alertBody: string;             // Full alert description
  severity: string;              // "critical", "warning", "info"
  language?: string;             // "en", "ar", etc
  onStaged?: () => void;         // Callback after success
  className?: string;            // Additional styling
  label?: string;                // Custom button text
}
```

**Alert Type Labels (EN/AR):**
- `keyword_rank_drop`: "Keyword Rank Drop" / "انخفاض ترتيب الكلمة المفتاحية"
- `sentiment_shift`: "Sentiment Shift" / "تغيير المشاعر"
- `rating_decline`: "Rating Decline" / "انخفاض التقييم"
- `crash_spike`: "Crash Spike" / "ارتفاع الأعطال"
- `competitor_mention`: "Competitor Mention" / "ذكر المنافس"
- `review_surge`: "Review Surge" / "ارتفاع المراجعات"
- `security_issue`: "Security Issue" / "مشكلة أمان"

**Severity Color Mapping:**
- `critical`: Rose/red theme, highPriority flag = true
- `warning`: Amber/yellow theme, highPriority flag = false
- `info`: Blue theme, highPriority flag = false

**Metadata Captured:**
```json
{
  "alertType": "keyword_rank_drop",
  "alertTitle": "Keyword Rank Drop",
  "severity": "critical",
  "highPriority": true,
  "detectedAt": "2026-06-04T00:00:00Z"
}
```

**Integration Location:**
- File: `components/alerts/AlertsPanel.tsx`
- Section: LiveAlertCard component (lines ~127-138)
- Layout: Below alert body text in flex container

---

## Localization Strategy

### RTL Language Detection
Both components automatically detect RTL languages:
```typescript
const isRtl = ["ar", "he", "fa", "ur"].includes(language);
```

Applied to:
- Button `dir` attribute: `dir={isRtl ? "rtl" : "ltr"}`
- Flex direction: `className={cn("flex gap-2", isRtl && "flex-row-reverse")}`

### Translation Strings

**Keyword Tracker:**
- Success: "تمت الإضافة بنجاح" (AR) / "Keyword Staged" (EN)
- Error: "خطأ في الإضافة" (AR) / "Failed to Stage" (EN)
- Loading: "جاري الإضافة..." (AR) / "Staging..." (EN)
- Staged: "تمت الإضافة" (AR) / "Staged" (EN)
- Button: "إضافة إلى الخزنة" (AR) / "Stage Keyword" (EN)

**Alerts:**
- Success: "تمت الإضافة بنجاح" (AR) / "Alert Staged" (EN)
- Error: "خطأ في الإضافة" (AR) / "Failed to Stage" (EN)
- Loading: "جاري الإضافة..." (AR) / "Staging..." (EN)
- Staged: "مرحلة" (AR) / "Staged" (EN)
- Button: "إضافة إلى الخزنة" (AR) / "Stage Alert" (EN)

### Language Context Flow
- Component receives `language` prop (or detects via `useLocale()`)
- Toast notifications automatically use detected language
- Button text switches based on language
- All metadata preserves original language code

---

## State Management

### Button State Machine

**Both components** follow identical state progression:

```
IDLE (default)
  ↓ (user clicks)
LOADING (API call in progress)
  - Shows spinner
  - Text: "Staging..." / "جاري الإضافة..."
  - Button disabled
  ↓ (success)
STAGED (confirmed)
  - Shows checkmark icon
  - Text: "Staged" / "مرحلة"
  - Button permanently disabled
  ↓ (error)
IDLE → Error toast shown
```

### State Implementation
```typescript
const [loading, setLoading] = useState(false);
const [staged, setStaged] = useState(false);

// Guard against re-staging
if (loading || staged) return;
```

### Toast Notifications
Using `useToast()` hook from `@/hooks/useToast`:
```typescript
showToast({
  type: "success|error",
  title: localized title,
  message: detailed message,
  duration: 3000|4000
});
```

---

## Files Changed - Phase 2

### Modified Files (5)

1. **components/alerts/AlertsPanel.tsx**
   - Added: `useLocale` import
   - Added: AlertsStagingButton import
   - Modified: `LiveAlertCard` function signature (added workspaceId, appId, language props)
   - Modified: LiveAlertCard render call (pass locale)
   - Modified: LiveAlertCard body (add AlertsStagingButton component)

2. **components/keyword-tracker/KeywordTrackerClient.tsx**
   - Added: KeywordTrackerStagingButton import
   - Modified: AI Suggested Keywords section (lines ~1316-1325)
   - Added: Flex container wrapper with RTL support
   - Added: KeywordTrackerStagingButton component alongside Track button

3. **components/reviews/IssueCard.tsx** (Phase 1)
   - Removed: useRouter, unused icons, tooltip imports
   - Replaced: CTA button section with StageButton

4. **components/market/MarketIntelligenceClient.tsx** (Phase 1)
   - Removed: useRouter, Wand2 icon
   - Replaced: OptimizeWithSpotlightButton function with StageButton

5. **components/competitor-spy/competitor-spy-snapshot-card.tsx** (Phase 1)
   - Removed: Sparkles icon, tooltip imports, onSendToOptimizer prop
   - Replaced: TooltipProvider/Button with StageButton

### New Files (2)

1. **components/keyword-tracker/KeywordTrackerStagingButton.tsx**
   - 170 lines
   - Complete implementation with all features

2. **components/alerts/AlertsStagingButton.tsx**
   - 200 lines
   - Complete implementation with all features

### Documentation Files (1)

1. **STAGING_VAULT_INTEGRATION_SUMMARY.md**
   - Comprehensive reference of all changes
   - Testing checklist
   - Summary table of all modifications

---

## Technical Decisions & Rationale

### Decision 1: Persistent Vault over URL Navigation
**Context:** Old system used `router.push()` to navigate, losing context  
**Decision:** Store signals in `workspace_staging_vault` table  
**Rationale:**
- User stays on current page with visual feedback
- Metadata preserved in JSONB fields
- Better UX: no disorienting navigation
- Enables bulk staging workflow
- Works with RTL layouts seamlessly

---

### Decision 2: Specialized Staging Buttons vs Generic
**Context:** Could use single StageButton everywhere  
**Decision:** Created specialized KeywordTrackerStagingButton and AlertsStagingButton  
**Rationale:**
- Different metadata requirements per module
- Alert severity color mapping (critical/warning/info)
- Alert type labels (7 types with translations)
- Rank-specific metadata for keywords
- Cleaner props API per use case
- Easier to maintain domain-specific logic

---

### Decision 3: RTL Implemented at Component Level
**Context:** Need to support Arabic, Hebrew, Farsi, Urdu  
**Decision:** Auto-detect in each component based on language code  
**Rationale:**
- `useLocale()` provides locale context automatically
- Consistent detection logic: `["ar", "he", "fa", "ur"]`
- Applied to both button dir attribute and flex layout
- Works regardless of page-level RTL settings
- Easier to test and maintain in isolation

---

### Decision 4: Metadata as JSONB with Signal-Specific Fields
**Context:** Different modules have different context needs  
**Decision:** Define metadata schema per signal type, store as JSONB  
**Rationale:**
- Flexible for future fields without schema migration
- Keyword: rank, volume, difficulty, market
- Alert: type, severity, priority, timestamp
- Review: severity, impact %, quote
- Competitor: name, rank, keyword count
- Preserves domain-specific context for later consumption

---

### Decision 5: Toast Notifications for Confirmation
**Context:** Need user confirmation without navigation  
**Decision:** Use sonner toast library with duration-based auto-dismiss  
**Rationale:**
- Non-intrusive feedback
- Auto-dismisses (3s success, 4s error)
- Language-aware messages
- Doesn't block page interaction
- Already integrated in codebase

---

### Decision 6: No Page Refresh After Staging
**Context:** Could refresh page to show updated state  
**Decision:** Keep state local in component, no refetch  
**Rationale:**
- Preserves user scroll position and form state
- Faster perceived performance
- Vault page shows updates when user navigates there
- Avoids unnecessary server load
- User focus stays on current task

---

## Import Dependencies

Both new components require:
```typescript
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
```

Parent components additionally need:
```typescript
import { useLocale, useTranslations } from "next-intl";
```

---

## API Response Handling

All staging endpoints expect:
```typescript
type StagingResponse = {
  id: string;           // Vault entry ID
  signalType: string;   // Echoed back
  source: string;       // Echoed back
  stagedAt: string;     // ISO timestamp
  // May include additional fields
};
```

Both components:
1. Check `response.ok` after fetch
2. Parse JSON response (logged but not used in UI)
3. Set `staged = true` on success
4. Catch errors and display in toast with user's language

---

## Testing & Validation

### Manual Test Cases

**Keyword Tracker:**
- [ ] Stage button appears in AI Suggested Keywords section
- [ ] Button transitions: idle → loading → staged
- [ ] Toast shows "تمت الإضافة بنجاح" (AR) or "Keyword Staged" (EN)
- [ ] Button disabled after staging
- [ ] Metadata flows: countryCode, currentRank, searchVolume, difficulty
- [ ] RTL layout works correctly (flex-row-reverse)
- [ ] Side-by-side layout with Track button maintained

**Alerts:**
- [ ] Stage button appears below each alert
- [ ] Button color matches alert severity (rose/amber/blue)
- [ ] Toast shows alert type label (EN/AR)
- [ ] Critical alerts have highPriority flag
- [ ] All alert type labels translated
- [ ] RTL rendering correct
- [ ] Metadata preserved: alertType, severity, timestamp

**Common:**
- [ ] Error messages display in user's language
- [ ] Loading spinner visible during API call
- [ ] Checkmark icon visible when staged
- [ ] Button remains disabled after staging
- [ ] No page reload after staging

---

## Future Enhancements

1. **Bulk Staging:** Allow staging multiple keywords/alerts at once
2. **Undo:** Add "undo stage" within time window (5-10s)
3. **Staging Preview:** Show what will be sent before confirming
4. **Stats Dashboard:** Show user's staging activity over time
5. **Webhook Integration:** Notify external systems when signals staged
6. **Custom Filters:** Let users stage only signals matching criteria
7. **Vault History:** Track which module/user staged each signal

---

## Deployment Checklist

- [x] All components import correctly
- [x] No TypeScript errors
- [x] RTL layout tested visually
- [x] Toast messages display in correct language
- [x] Button state transitions smooth
- [x] Metadata preserved in requests
- [x] Error handling implemented
- [x] No console warnings
- [ ] E2E tests written (future)
- [ ] Performance metrics captured (future)

---

## Rollback Plan

If issues occur, revert to previous version:
```bash
git revert <commit-hash>
```

Previous working state:
- Old navigation buttons still exist in git history
- Phase 1 completion commit available
- Can revert by module if needed

---

## Documentation References

- **STAGING_VAULT_INTEGRATION_SUMMARY.md** - Detailed change log and testing checklist
- **Components/** - Individual component files with inline comments
- **/api/workspaces/[id]/staging/add** - Backend API endpoint documentation

---

## Version History

| Date | Phase | Status | Key Changes |
|------|-------|--------|-------------|
| 2026-06-03 | Phase 1 | Complete | Reviews, Market Intelligence, Competitor Spy |
| 2026-06-04 | Phase 2 | Complete | Keyword Tracker, Alerts |
| | | **FULL REFACTOR COMPLETE** | All 5 modules integrated |

---

**Next Session:** Review deployment logs and monitor vault usage metrics.

---

## Quick Reference - This Session's Work

### Git Commands to Push Changes
```bash
# Stage all changes
git add -A

# Commit with descriptive message
git commit -m "feat: Complete Staging Vault frontend refactor - Phase 2 integration

- Add KeywordTrackerStagingButton component for keyword staging
- Add AlertsStagingButton component for alert staging
- Integrate staging buttons into KeywordTrackerClient AI Suggestions section
- Integrate staging buttons into AlertsPanel alert cards
- Update all components with persistent Staging Vault integration
- Support RTL/LTR localization for both modules
- Preserve metadata (rank, volume, severity, etc.) through staging system"

# Push to remote
git push origin main
```

### Files Modified in This Session
1. `components/keyword-tracker/KeywordTrackerClient.tsx` - Added staging button to AI suggestions
2. `components/alerts/AlertsPanel.tsx` - Added staging button to alert cards
3. `components/keyword-tracker/KeywordTrackerStagingButton.tsx` - New component
4. `components/alerts/AlertsStagingButton.tsx` - New component
5. `STAGING_VAULT_INTEGRATION_SUMMARY.md` - Detailed change log

### Quick Links for Future Sessions
- **Architecture Details:** See "Technical Architecture" section
- **Component Props:** See "Components Architecture" section
- **Localization:** See "Localization Strategy" section
- **State Management:** See "State Management" section
- **Decision Rationale:** See "Technical Decisions & Rationale" section
