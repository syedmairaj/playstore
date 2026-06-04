# Staging Vault Frontend Refactor - Phase 2 Complete

## Summary
Successfully completed Phase 2 of the Staging Vault frontend refactor by integrating the two remaining modules: **Keyword Tracker** and **Alerts**. All legacy navigation-based buttons have been replaced with persistent Staging Vault integration.

---

## Phase 1 Completed (Previous)
- ✅ Reviews Module - `components/reviews/IssueCard.tsx`
- ✅ Market Intelligence Module - `components/market/MarketIntelligenceClient.tsx`
- ✅ Competitor Spy Module - `components/competitor-spy/competitor-spy-snapshot-card.tsx`

---

## Phase 2 Completed (Current)

### 1. Keyword Tracker Integration
**File:** `components/keyword-tracker/KeywordTrackerClient.tsx`

#### Changes:
- **Added:** Import of `KeywordTrackerStagingButton`
- **Location:** AI Suggested Keywords section (lines ~1309-1329)
- **Implementation:** Added flex container wrapping Track Keyword button with new Stage Keyword button
- **Button Props:**
  - `workspaceId`: Workspace ID
  - `appId`: Scope app ID
  - `keyword`: The keyword string
  - `market`: Selected country (from `selectedCountries[0]`)
  - `language`: Current locale
  - `size`: "sm"
  - `variant`: "secondary"

#### Features:
- RTL auto-detection based on language
- Loading spinner during API call
- Staged state with checkmark confirmation
- Dual language support (EN/AR)
- Metadata preserved: country code, rank, search volume, difficulty

#### API Endpoint:
```
POST /api/workspaces/{workspaceId}/staging/add
```
- Signal Type: `keyword`
- Source: `keyword_tracker`
- Content: The keyword string

---

### 2. Alerts Integration
**Files:** 
- `components/alerts/AlertsPanel.tsx` (modified)
- `components/alerts/AlertsStagingButton.tsx` (created)

#### Changes to AlertsPanel:
- **Added:** `useLocale` hook import
- **Updated:** `LiveAlertCard` function signature with new props:
  - `workspaceId`: Required
  - `appId`: Optional
  - `language`: Optional (uses locale)
- **Updated:** LiveAlertCard call to pass `workspaceId`, `appId`, `language` props
- **Added:** AlertsStagingButton component in alert card layout (below alert body)

#### Features of AlertsStagingButton:
- Severity-based color styling:
  - Critical: Rose/red
  - Warning: Amber/yellow
  - Info: Blue
- Alert type label mapping (EN/AR):
  - keyword_rank_drop
  - sentiment_shift
  - rating_decline
  - crash_spike
  - competitor_mention
  - review_surge
  - security_issue
- Loading state with spinner
- Staged state with checkmark
- High-priority flagging for critical severity

#### API Endpoint:
```
POST /api/workspaces/{workspaceId}/staging/add
```
- Signal Type: `optimization_insight`
- Source: `api`
- Source Context: `alert`
- Content: `[SEVERITY] AlertType: AlertBody`
- Metadata includes: alertType, alertTitle, severity, highPriority, detectedAt

---

## Component Architecture

### KeywordTrackerStagingButton
- **Location:** `components/keyword-tracker/KeywordTrackerStagingButton.tsx`
- **Size:** ~170 lines
- **Usage:** AI Suggested Keywords section
- **State:** loading → staged (with visual feedback)

### AlertsStagingButton
- **Location:** `components/alerts/AlertsStagingButton.tsx`
- **Size:** ~200 lines
- **Usage:** Each alert card in Alerts Panel
- **State:** loading → staged (with visual feedback)

---

## Localization Support

Both modules automatically detect RTL languages:
- Arabic (ar)
- Hebrew (he)
- Farsi/Persian (fa)
- Urdu (ur)

All other languages default to LTR.

### Translations:
- Success: "تمت الإضافة بنجاح" (AR) / "Staged" (EN)
- Error: "خطأ في الإضافة" (AR) / "Failed to Stage" (EN)
- Loading: "جاري الإضافة..." (AR) / "Staging..." (EN)

---

## Metadata Preservation

### Keyword Tracker
```json
{
  "countryCode": "US",
  "currentRank": 5,
  "previousRank": 8,
  "searchVolume": 1200,
  "difficulty": 45,
  "market": "us"
}
```

### Alerts
```json
{
  "alertType": "keyword_rank_drop",
  "alertTitle": "Keyword Rank Drop",
  "severity": "critical",
  "highPriority": true,
  "detectedAt": "2026-06-04T00:00:00Z"
}
```

---

## UI/UX Improvements

### Staged Visual Feedback
1. **Before Click:** Default state button (emerald for Keyword, severity-color for Alerts)
2. **During Call:** Loading spinner with "Staging..." text
3. **After Success:** Checkmark icon with "Staged" text, button disabled
4. **Toast Notification:** Success/error message with details

### Button Layout
- **Keyword Tracker:** Side-by-side with Track button (flex gap-2)
- **Alerts:** Below alert body in flex container

---

## Testing Checklist

- [ ] Keyword Tracker: Stage button appears in AI Suggested Keywords section
- [ ] Keyword Tracker: Button shows loading state during API call
- [ ] Keyword Tracker: Button transitions to "Staged" state on success
- [ ] Keyword Tracker: Metadata flows through staging system correctly
- [ ] Alerts: Stage button appears on each alert card
- [ ] Alerts: Button color matches alert severity
- [ ] Alerts: Alert details captured in staging system
- [ ] Alerts: Arabic/RTL rendering works correctly
- [ ] Keyword Tracker: Arabic/RTL rendering works correctly
- [ ] Toast notifications appear with correct messages
- [ ] Disabled state applies correctly when already staged

---

## Summary of All Changes

| Module | File | Changes | Status |
|--------|------|---------|--------|
| Reviews | `IssueCard.tsx` | Replaced CTA button with StageButton | ✅ Complete |
| Market Intelligence | `MarketIntelligenceClient.tsx` | Replaced Optimizer button with StageButton | ✅ Complete |
| Competitor Spy | `competitor-spy-snapshot-card.tsx` | Added StageButton for competitor weakness | ✅ Complete |
| Keyword Tracker | `KeywordTrackerClient.tsx` | Added KeywordTrackerStagingButton to AI suggestions | ✅ Complete |
| Alerts | `AlertsPanel.tsx` | Added AlertsStagingButton to each alert card | ✅ Complete |

---

## Refactor Complete ✅

All five modules now use the persistent Staging Vault integration. No navigation-based buttons remain. Users can now stage signals directly from any module with full metadata preservation and immediate visual feedback.
