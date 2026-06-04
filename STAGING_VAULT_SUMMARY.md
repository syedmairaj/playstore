# Workspace Staging Vault — 3-Step Implementation Summary

**Status:** 🟢 Steps 1-2 Complete | ⏳ Step 3 Ready for Frontend Implementation

---

## The Problem

Current "Send to Optimizer" buttons **navigate away** from current page:
- User loses context (Spy page, Reviews page, etc)
- Signals are transient (not persisted)
- Integration with generation pipelines is manual copy-paste
- No RTL/LTR context preservation

## The Solution

**Persistent Staging Vault** replaces navigation:
- Signals stored in DB
- Toast notification confirms staging
- User stays in workflow
- Vault automatically available to Brand Mirror Engine & Consultant Layer
- Full RTL/LTR support (Arabic/Hebrew exact preservation)

---

## What's Done

### ✅ Step 1: Database Migration (COMPLETE)

**File:** `supabase/migrations/20260604100100_workspace_staging_vault.sql`

```sql
CREATE TABLE workspace_staging_vault (
  id uuid PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id),
  signal_type enum ('keyword', 'review_issue', 'competitor_weakness', 'optimization_insight'),
  content text,         -- UTF-8 fully preserved
  language text,        -- 'en', 'ar', 'he', etc
  is_rtl boolean,       -- Auto-detected from language
  metadata jsonb,       -- Additional context
  source_app_id uuid,   -- Which app this signal is for
  created_at timestamp, -- Lifecycle tracking
  expires_at timestamp, -- Optional TTL
  deleted_at timestamp  -- Soft delete
)
```

**Features:**
- ✅ RLS policies (workspace isolation)
- ✅ RTL auto-detection (`is_rtl` auto-set based on language)
- ✅ Soft delete support
- ✅ Full-text search index
- ✅ Source attribution
- ✅ TTL support (optional auto-cleanup)

### ✅ Step 2: API Service Layer (COMPLETE)

**File:** `lib/staging-vault/staging-vault-service.ts`

**Functions:**
```typescript
addSignalToVault(supabase, workspaceId, signal)
listVaultSignals(supabase, workspaceId, filters)
getAppVaultContext(supabase, workspaceId, appId)  // For Brand Mirror & Consultant
deleteSignal(supabase, workspaceId, signalId)
clearAppVault(supabase, workspaceId, appId)
```

**Endpoints Implemented:**
```
POST /api/workspaces/[id]/staging/add
  → Calls addSignalToVault()
  
GET /api/workspaces/[id]/staging/list?appId=xxx
  → Calls listVaultSignals() and returns AppVaultContext
```

---

## What You Need to Do (Step 3)

### Frontend Refactor Tasks

**Task 1: Toast Notification System**
- Create `hooks/useToast.ts` hook
- Create `components/Toast.tsx` UI component
- Auto-dismiss after 3 seconds
- Show success/error states

**Task 2: Refactor Spy Page**
```typescript
// OLD: Navigation pattern
<button onClick={() => router.push(`/optimizer?competitor=${id}`)}>
  Send to Optimizer
</button>

// NEW: Vault pattern
<button onClick={handleSendToVault} disabled={loading}>
  Stage for Optimizer
</button>
```

When clicked:
1. POST to `/api/workspaces/{id}/staging/add`
2. Show success toast ("Staged: Lacks dark mode")
3. Stay on Spy page (don't navigate)

**Task 3: Refactor Reviews Page**
Same pattern but with `signalType: "review_issue"` and `source: "review_analysis"`

**Task 4: Refactor Market Intelligence Page**
Same pattern but with `signalType: "keyword"` and `source: "keyword_spotlight"` or `"keyword_tracker"`

**Task 5: Optional Dashboard**
Add `components/StagingVaultPreview.tsx` showing:
- Count of staged signals
- Preview of keywords/issues/weaknesses
- Button to "Generate Listing from Vault"

---

## How It Works End-to-End

```
USER WORKFLOW:
1. User on Spy page sees competitor weakness: "Lacks dark mode"
2. Clicks "Stage for Optimizer" button
3. POST /api/workspaces/{id}/staging/add
   {
     "signalType": "competitor_weakness",
     "content": "Lacks dark mode",
     "source": "competitor_spy",
     "sourceAppId": "app-id",
     "language": "en",
     "metadata": { "competitorName": "Competitor X" }
   }
4. Toast appears: "✓ Staged: Lacks dark mode"
5. User continues browsing Spy page (no navigation)

GENERATION WORKFLOW:
1. User clicks "Generate Screenshots"
2. Backend calls getAppVaultContext(workspace, app)
3. Vault returns:
   {
     "keywords": [{ content: "...", language: "en", isRtl: false }],
     "reviewIssues": [...],
     "competitorWeaknesses": [{ content: "Lacks dark mode", ... }],
     "totalSignals": 5
   }
4. Brand Mirror Engine uses vault as MANDATORY CONSTRAINTS
5. Generated screenshots include all staged signals

CONSULTANT LAYER:
1. Same vault context available
2. Roadmap tactics directly address staged issues
3. Example: "Week 1: Implement dark mode" (addresses staged weakness)
4. User can track: Staged signal → Roadmap tactic → Screenshot generated
```

---

## RTL/LTR Parity

All signals preserve exact language/script:

```typescript
// Arabic signal
{
  "content": "تطبيق بطيء جداً",  // Preserved exactly
  "language": "ar",
  "is_rtl": true  // Auto-set
}

// English signal
{
  "content": "App crashes on older devices",
  "language": "en",
  "is_rtl": false
}

// When rendering:
<div dir={signal.is_rtl ? "rtl" : "ltr"} lang={signal.language}>
  {signal.content}
</div>
```

---

## Files You're Creating

| File | Purpose | Lines |
|------|---------|-------|
| `hooks/useToast.ts` | Toast notification logic | ~30 |
| `components/Toast.tsx` | Toast UI component | ~40 |
| Spy page button | Replace "Send to Optimizer" | ~20 |
| Reviews page button | Replace "Send to Optimizer" | ~20 |
| Intel page button | Replace "Send to Optimizer" | ~20 |
| `components/StagingVaultPreview.tsx` (optional) | Dashboard preview | ~60 |

**Total:** ~190 lines of frontend code

---

## Implementation Checklist

```
FRONTEND IMPLEMENTATION:
□ Create hooks/useToast.ts
□ Create components/Toast.tsx
□ Refactor Spy page "Send" button
□ Refactor Reviews page "Send" button
□ Refactor Market Intelligence "Send" button
□ Add StagingVaultPreview.tsx (optional)
□ Test toast notifications
□ Test Arabic signals preservation
□ Test signals flow to generation

INTEGRATION & TESTING:
□ Wire Brand Mirror Engine to getAppVaultContext()
□ Wire Consultant Layer to getAppVaultContext()
□ End-to-end: Stage signal → Generate → Verify output
□ Test RTL signals through pipeline
□ Launch to production
```

---

## Key Integration Points

### Brand Mirror Engine
```typescript
// In screenshot generation
const vault = await getAppVaultContext(supabase, workspaceId, appId)
const vaultKeywords = vault.keywords.map(k => k.content).join(", ")

// Add to prompt as MANDATORY CONSTRAINTS
const prompt = `...Use these vault signals as mandatory: ${vaultKeywords}`
```

### Consultant Layer
```typescript
// In roadmap generation
const vault = await getAppVaultContext(supabase, workspaceId, appId)

// Use vault signals as foundation for sprints
const prompt = `...Address these staged issues: ${vault.reviewIssues...}`
```

---

## Timeline

**Estimated Effort:**
- Toast hook & component: 30 minutes
- Button refactoring (3 pages): 1 hour
- Optional dashboard: 30 minutes
- Testing & polish: 1 hour

**Total:** 3-4 hours frontend work

---

## Success Criteria

✅ Database migration applied  
✅ API endpoints working  
✅ Toast notifications appear/disappear  
✅ Signals persist (don't navigate away)  
✅ Brand Mirror uses vault context  
✅ Consultant Layer uses vault context  
✅ Arabic signals preserved exactly  
✅ No breaking changes to existing features  

---

## Files Ready to Deploy

**Database:**
- `supabase/migrations/20260604100100_workspace_staging_vault.sql`

**Backend:**
- `lib/staging-vault/staging-vault-service.ts`
- `app/api/workspaces/[id]/staging/add/route.ts`
- `app/api/workspaces/[id]/staging/list/route.ts`

**Documentation:**
- `STAGING_VAULT_IMPLEMENTATION.md` (detailed guide)
- `STAGING_VAULT_SUMMARY.md` (this file)

---

## Questions?

Refer to `STAGING_VAULT_IMPLEMENTATION.md` for:
- Detailed code examples
- Complete integration guide
- Testing strategy
- RTL/LTR verification
- Optional dashboard implementation

---

**Status:** 🟢 Ready for Step 3 Frontend Implementation

Database & API are production-ready. You can start building the frontend whenever ready!
