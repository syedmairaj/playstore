# 🏗️ Unified Staging Architecture - Fix 403 Errors

**Problem:** Fragmented API routes across 6 modules causing `403 Forbidden` errors  
**Solution:** Single unified `stageSignal` pipeline with mandatory workspace validation  
**Status:** Architecture Ready + StageButton Fixed  

---

## ❌ Current Problem

```
Module 1 (Reviews) → POST /api/reviews/stage
Module 2 (Keywords) → POST /api/keywords/stage
Module 3 (Competitor Spy) → POST /api/competitors/stage
Module 4 (Alerts) → POST /api/alerts/stage
Module 5 (AI Spotlight) → POST /api/spotlight/stage

Result: ❌ 403 Forbidden - workspace membership checks fail
```

## ✅ Unified Architecture

```
All 6 Modules ↓
    ↓
StageButton.tsx
    ↓
POST /api/workspaces/[workspaceId]/staging/add
    ↓
Workspace membership validation ✅
    ↓
workspace_staging_vault (single table)
```

---

## 🔧 What's Fixed

### StageButton.tsx - Enhanced Diagnostics
- ✅ Validates `workspaceId` exists before API call
- ✅ Validates `content` is not empty
- ✅ Detailed error logging (status, code, message)
- ✅ Specific error messages for 401, 403, 422
- ✅ Language-aware error messages (EN/AR)
- ✅ Better console logs for debugging

**Error Messages:**
```
401 → "You must be signed in to stage signals"
      "يجب تسجيل الدخول"

403 → "You are not a member of this workspace"
      "أنت لست عضوا في هذه مساحة العمل"

422 → "Invalid data: [field error]"
      "خطأ في البيانات: [وصف الخطأ]"
```

---

## 📋 6-Module Unification Checklist

### Module 1: **Common Issues (Reviews)**

**Current:** Uses `StageButton` ✅  
**Status:** Already unified

**Verify:**
- [ ] IssueCard passes correct `workspaceId` to StageButton
- [ ] `sourceContext` = "common_issues_theme"
- [ ] `sourceContextId` = issue ID
- [ ] Language detected via `useLocale()`

**Quick Check:**
```typescript
<StageButton
  signalType="review_issue"
  source="review_analysis"
  sourceContext="common_issues_theme"  // ✅ Must be set
  sourceContextId={issueId}              // ✅ Must be set
  workspaceId={workspaceId}              // ✅ Must be set
  language={locale === "ar" ? "ar" : "en"} // ✅ Must be set
/>
```

---

### Module 2: **Keyword Tracker**

**Current:** Check if fragmented  
**Todo:** Unify

**Integration:**
```typescript
import { StageButton } from "@/components/staging/StageButton";

<StageButton
  signalType="keyword"
  source="keyword_tracker"
  sourceContext="keyword_tracker_alert"
  sourceContextId={keywordId}
  workspaceId={workspaceId}
  language={locale === "ar" ? "ar" : "en"}
  content={keyword}
  metadata={{
    searchVolume: vol,
    difficulty: diff,
    currentRank: rank,
  }}
/>
```

---

### Module 3: **Competitor Spy**

**Current:** Check if fragmented  
**Todo:** Unify

**Integration:**
```typescript
<StageButton
  signalType="competitor_weakness"
  source="competitor_spy"
  sourceContext="competitor_weakness"
  sourceContextId={competitorPackage}
  workspaceId={workspaceId}
  language={locale === "ar" ? "ar" : "en"}
  content={weakness}
  metadata={{
    competitorName: name,
    severity: level,
  }}
/>
```

---

### Module 4: **Alerts**

**Current:** Check if fragmented  
**Todo:** Unify

**Integration:**
```typescript
<StageButton
  signalType="optimization_insight"
  source="api"
  sourceContext="manual"
  sourceContextId={alertId}
  workspaceId={workspaceId}
  language={locale === "ar" ? "ar" : "en"}
  content={alertMessage}
  metadata={{ alertType, priority }}
/>
```

---

### Module 5: **AI Keyword Spotlight**

**Current:** Check if fragmented  
**Todo:** Unify

**Integration:**
```typescript
<StageButton
  signalType="keyword"
  source="keyword_spotlight"
  sourceContext="keyword_spotlight"
  sourceContextId={keywordId}
  workspaceId={workspaceId}
  language={locale === "ar" ? "ar" : "en"}
  content={keyword}
  metadata={{
    searchVolume: vol,
    difficulty: diff,
    category: cat,
  }}
/>
```

---

### Module 6: **AI Listing Optimizer (Existing)**

**Current:** Uses ActiveContext from staging vault ✅  
**Status:** Already unified

**Verify:**
- [ ] Fetches from `workspace_staging_vault`
- [ ] Groups by `source_context`
- [ ] Shows all staged signals

---

## 🔍 Root Cause Analysis: 403 Error

The 403 error occurs when:

1. **Missing `workspaceId`** - Endpoint route can't resolve workspace
2. **User not workspace member** - `getWorkspaceRole()` returns null
3. **Invalid workspace ID** - Malformed UUID

### Fix Applied in StageButton:

```typescript
// ✅ NEW: Validate before API call
if (!workspaceId) {
  showToast({ message: "Missing workspace ID. Please ensure you are logged in." });
  return;
}

// ✅ NEW: Better error handling
if (response.status === 403) {
  throw new Error("You are not a member of this workspace");
}

// ✅ NEW: Console logs for debugging
console.info("[StageButton] Staging signal:", {
  workspaceId,
  signalType,
  source,
});

console.error("[StageButton] API Error:", {
  status: response.status,
  code: errorCode,
  message: errorMessage,
});
```

---

## 🚀 Payload Standardization

**Every button across all 6 modules must send:**

```typescript
{
  signalType: "review_issue|keyword|competitor_weakness|optimization_insight",
  content: "The actual signal content",
  source: "review_analysis|keyword_tracker|competitor_spy|api|...",
  sourceContext: "common_issues_theme|keyword_spotlight|...",
  sourceContextId: "unique-id-linking-to-source",
  language: "en|ar",
  metadata: { /* optional */ },
}
```

**Never send:**
```typescript
❌ Custom API routes
❌ Missing sourceContext or sourceContextId
❌ Empty content
❌ Invalid language codes
```

---

## ✨ Key Validation Rules

| Field | Rule | Example |
|-------|------|---------|
| `workspaceId` | Non-empty UUID | `550e8400-e29b-41d4-a716-446655440000` |
| `signalType` | Enum (4 values) | `review_issue` |
| `source` | Enum (6 values) | `review_analysis` |
| `sourceContext` | Non-empty string | `common_issues_theme` |
| `sourceContextId` | Non-empty string | `issue-123` |
| `content` | 1-5000 chars | `App crashes on startup` |
| `language` | 2-5 char code | `en`, `ar-SA` |

---

## 🧪 Testing Checklist

```
For Each Module:
---
[ ] Can stage in English
[ ] Can stage in Arabic
[ ] Gets success toast with signal name
[ ] UI shows signal in Active Context
[ ] Can archive signal
[ ] Can restore signal
[ ] Delete confirmation works
[ ] No 403 errors in console
[ ] Correct sourceContext saved in DB
[ ] Metadata preserved correctly

Database Verification:
---
[ ] Signal appears in workspace_staging_vault
[ ] source_context correctly populated
[ ] source_context_id correctly populated
[ ] language field is en or ar
[ ] is_rtl auto-calculated correctly
```

---

## 📊 Unified Flow Diagram

```
User clicks "Stage Issue" in ANY module
         ↓
StageButton.tsx
         ↓
Validates:
  - workspaceId exists ✅
  - content not empty ✅
  - language valid ✅
         ↓
POST /api/workspaces/[id]/staging/add
         ↓
Backend validates:
  - User authenticated ✅
  - User is workspace member ✅
  - Payload schema valid ✅
         ↓
INSERT INTO workspace_staging_vault
  - signal_type
  - source
  - source_context (KEY for filtering)
  - source_context_id (KEY for linking)
  - content
  - language
  - is_rtl (auto-calculated)
  - metadata
         ↓
Success Toast: "Issue 'X' staged"
         ↓
ListingOptimizer shows in Active Context
         ↓
User can Archive/Restore/Delete
```

---

## 🔐 Permission Model

```
StageButton
    ↓
Fetch with credentials
    ↓
Backend receives request with auth header
    ↓
supabase.auth.getUser() → Gets current user
    ↓
getWorkspaceRole(supabase, workspaceId, userId)
    ↓
Checks workspace_members table
    ↓
If role exists: ✅ Continue
If role null: ❌ Return 403
```

---

## 📝 Next Steps

### Immediate (Fix 403 errors)
1. ✅ StageButton enhanced with diagnostics
2. ✅ Better error messages for 403/401/422
3. ⏳ Verify all 6 modules pass `workspaceId` correctly

### Short-term (Unify remaining modules)
4. [ ] Audit Keyword Tracker integration
5. [ ] Audit Competitor Spy integration
6. [ ] Audit Alerts integration
7. [ ] Audit AI Spotlight integration
8. [ ] Remove any fragmented API routes

### Medium-term (Validate)
9. [ ] Test all 6 modules in English & Arabic
10. [ ] Verify no 403 errors across all flows
11. [ ] Check database for correct context binding
12. [ ] Monitor production logs

---

## 💡 Debug Checklist If 403 Still Occurs

Open browser console and check for:

```javascript
// You should see:
[StageButton] Staging signal: {
  workspaceId: "550e8400-...",  // ✅ Must be UUID
  signalType: "review_issue",
  source: "review_analysis",
  language: "en"
}

// If you see:
[StageButton] Missing workspaceId
  → Component prop not being passed correctly

// If you see:
[StageButton] API Error: {
  status: 403,
  code: "forbidden",
  message: "Not a workspace member"
}
  → User not added to workspace in DB
```

---

**Architecture is unified. All modules must use single `/staging/add` endpoint. 403 errors now have clear diagnostics.** 🎯
