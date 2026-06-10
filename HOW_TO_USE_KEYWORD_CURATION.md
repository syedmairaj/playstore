# How to Use Keyword Curation (Send to AI Optimizer)

## The Problem You Hit

You clicked the button on the **Snapshot Card** (the competitor card itself), which:
- Stages ALL keywords from that competitor as a batch
- Uses `competitor_weakness` signal type
- Auto-triggered on page load
- Doesn't show individual keyword selection

This is NOT the "Send to AI Optimizer" feature we fixed.

## The CORRECT Flow (What We Actually Fixed)

### Step 1: Enable Selection Mode

In the competitor snapshot card, look for a **toggle button** that says something like:
- "Click to select" (English)
- "انقر لتحديد" (Arabic)

This button switches from **Copy Mode** → **Selection Mode**

**Location:** In the keyword list area of the snapshot card

### Step 2: Select Individual Keywords

Once in **Selection Mode**, click on individual keyword pills to select them:
- Pill changes color (becomes highlighted/selected)
- Selection count appears at the top
- Floating action bar appears at the bottom when keywords are selected

**Example:**
- Click "health" → Selected
- Click "myfitnesspal" → Selected
- Count shows "2 Keywords Selected"

### Step 3: Click "Send to AI Optimizer"

The **floating action bar** appears at the bottom showing:
```
[2 Keywords Selected]
[High-Volume • Intent-Based]

[Clear] [Send to AI Optimizer]
```

Click the **"Send to AI Optimizer"** button

This is the button that triggers `KeywordCurationFloatingBar` (what we fixed).

### Step 4: See Toast & Navigate

- ✅ Green toast appears: "Keywords staged for AI Listing Optimizer"
- Option to click "Go to Optimizer" button
- Keywords appear in AI Listing Optimizer's "Active Context" → "Competitor Keywords" section

---

## UI Layout Reference

```
┌─────────────────────────────────────────┐
│  MyFitnessPal Snapshot Card             │
│                                         │
│  [Toggle Mode Button]  ← Click here!    │
│  "Click to select" / "Click to copy"    │
│                                         │
│  ┌─ High-Volume Keywords ─────┐         │
│  │ ☐ health                   │  ← Click pill
│  │ ☐ fitness                  │  ← Click pill
│  │ ☐ tracking                 │         │
│  └─────────────────────────────┘         │
│                                         │
│  ┌─ Intent-Based Keywords ────┐         │
│  │ ☐ myfitnesspal             │         │
│  │ ☐ calorie counter          │         │
│  └─────────────────────────────┘         │
│                                         │
│  [Snapshot Card Button - IGNORE]        │
│   (This is AUTO-staging, not manual)    │
│                                         │
└─────────────────────────────────────────┘

┌──── Floating Action Bar (When keywords selected) ────┐
│ 2 Keywords Selected                                  │
│ High-Volume • Intent-Based                           │
│                                                      │
│ [Clear]  [Send to AI Optimizer] ← Click HERE!       │
└──────────────────────────────────────────────────────┘
```

---

## Browser Console Logs to Watch For

When you click "Send to AI Optimizer" (on floating bar):

```
[KeywordCurationFloatingBar] 📍 STAGING KEYWORDS (NO NAVIGATION)
[KeywordCurationFloatingBar] ✅ STAGING SUCCESSFUL
[KeywordCurationFloatingBar] 🔄 INVALIDATING QUERY
```

If you see these, it worked! ✅

If you DON'T see these, you clicked the wrong button (snapshot card button instead of floating bar button).

---

## Two Different Staging Flows

### ❌ SNAPSHOT CARD Button (Auto-Stages on Load)
- **Signal Type:** `competitor_weakness`
- **Flow:** Automatic when page loads
- **Keywords:** ALL keywords from competitor (batch)
- **Toast:** None (silent)
- **Floating Bar:** No
- **Result:** Shows in Active Context as competitor weakness data
- **Component:** `CompetitorSpySnapshotCard` + `StageButtonRefactored`

### ✅ FLOATING ACTION BAR Button (Manual Selection)
- **Signal Type:** `optimization_insight`
- **Flow:** Manual click after selecting keywords
- **Keywords:** Only SELECTED keywords (individual)
- **Toast:** YES ✅ (green success toast)
- **Floating Bar:** YES ✅ (appears when keywords selected)
- **Result:** Shows in Active Context under "Competitor Keywords"
- **Component:** `KeywordSurfacesInline` + `KeywordCurationFloatingBar`

---

## Testing Checklist

- [ ] **Step 1:** Go to Competitor Spy page
- [ ] **Step 2:** Click the mode toggle button in the keyword list
- [ ] **Step 3:** Verify mode switched to "Selection Mode" (UI changes)
- [ ] **Step 4:** Click 2-3 individual keyword pills
- [ ] **Step 5:** Verify floating action bar appeared at bottom
- [ ] **Step 6:** Click "Send to AI Optimizer" button on floating bar
- [ ] **Step 7:** ✅ Green toast appears (check top of screen)
- [ ] **Step 8:** Navigate to AI Listing Optimizer
- [ ] **Step 9:** ✅ Keywords appear in Step 3 → "Active Context" → "Competitor Keywords"

---

## If It Still Doesn't Work

Open DevTools Console and:
1. Look for logs starting with `[KeywordCurationFloatingBar]`
2. If no logs appear → You clicked the wrong button
3. If logs appear but no toast → Check browser console for errors
4. If logs appear AND toast shows → Keywords should be in Optimizer

The logs are your debugging tool!
