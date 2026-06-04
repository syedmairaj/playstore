# Workspace Staging Vault — Complete Implementation Guide

**Status:** ✅ Ready for Integration  
**Date:** June 3, 2026  
**Phase:** 1 of 3 (Database & API complete, Frontend pending)

---

## Overview

Replace transient "Send to Optimizer" navigation pattern with persistent **Staging Vault**:
- **Persistent Context:** Signals stored in DB, not lost on navigation
- **Unified API:** Single entry point for all signal types
- **Pillar Integration:** Brand Mirror Engine & Consultant Layer consume vault context
- **RTL/LTR Parity:** Arabic/Hebrew content preserved exactly
- **Toast Notifications:** User-friendly confirmation in workflow

---

## What's Complete

### ✅ Step 1: Database Migration
**File:** `supabase/migrations/20260604100100_workspace_staging_vault.sql`

**Schema Features:**
- `workspace_staging_vault` table with RLS policies
- Signal types: keyword, review_issue, competitor_weakness, optimization_insight
- RTL detection (auto-set based on language code)
- Soft delete support (deleted_at, not hard delete)
- Full-text search index on content
- TTL support (expires_at for optional auto-cleanup)
- Source attribution (which page/feature created signal)

**Key Columns:**
- `signal_type` - Type of signal
- `content` - UTF-8 preserved (Arabic/English/emoji exact)
- `language` - Language code (en, ar, he, etc)
- `is_rtl` - Auto-detected from language
- `metadata` - JSON context (category, category, competing app, etc)
- `source_app_id` - Which app this signal is for
- `created_at, expires_at, deleted_at` - Lifecycle tracking

### ✅ Step 2: API Service Layer
**File:** `lib/staging-vault/staging-vault-service.ts`

**Functions:**
1. `addSignalToVault()` - Queue signal (POST endpoint)
2. `listVaultSignals()` - Get all signals grouped by type (GET endpoint)
3. `getAppVaultContext()` - Used by Brand Mirror Engine & Consultant Layer
4. `deleteSignal()` - Soft delete
5. `clearAppVault()` - Admin clear (deletes all for app)

**Type Definitions:**
```typescript
type SignalType = "keyword" | "review_issue" | "competitor_weakness" | "optimization_insight"
type SignalSource = "keyword_spotlight" | "keyword_tracker" | "review_analysis" | "competitor_spy" | "manual" | "api"

interface AppVaultContext {
  appId: string
  hasVaultContent: boolean
  keywords: Array<{ content, language, isRtl, source }>
  reviewIssues: Array<{ content, language, isRtl, metadata }>
  competitorWeaknesses: Array<{ content, language, isRtl, competitorId }>
  totalSignals: number
}
```

### ✅ Step 3: API Routes
**Files:**
- `app/api/workspaces/[workspaceId]/staging/add/route.ts`
- `app/api/workspaces/[workspaceId]/staging/list/route.ts`

**Endpoints:**
```
POST   /api/workspaces/[id]/staging/add
  Body: { signalType, content, source, sourceAppId, language, metadata, expiresAt }
  Response: { ok: true, data: { id, message } }

GET    /api/workspaces/[id]/staging/list?signalType=keyword&appId=xxx&language=en
  Response: { ok: true, data: { keywords, reviewIssues, competitorWeaknesses, total } }
```

---

## Next Steps: Frontend Refactor (Step 3)

### 1. Toast Notification System

Add a lightweight toast notification when signals are staged:

```typescript
// hooks/useToast.ts
export function useToast() {
  const [toast, setToast] = useState<{
    message: string
    type: "success" | "error"
    id: string
  } | null>(null)

  const show = (message: string, type: "success" | "error" = "success") => {
    const id = Math.random().toString(36).substr(2, 9)
    setToast({ message, type, id })
    setTimeout(() => setToast(null), 3000) // Auto-dismiss after 3s
  }

  return { toast, show }
}
```

**UI Component:**
```typescript
// components/Toast.tsx
export function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div className={`toast ${type}`}>
      <span>{message}</span>
      {type === "success" && <span className="icon">✓</span>}
    </div>
  )
}
```

### 2. Refactor "Send to Optimizer" Buttons

**BEFORE (Spy Page):**
```typescript
<button onClick={() => router.push(`/optimizer?competitor=${competitor.id}`)}>
  Send to Optimizer
</button>
```

**AFTER (Spy Page):**
```typescript
const { show: showToast } = useToast()
const [loading, setLoading] = useState(false)

const handleSendToVault = async () => {
  setLoading(true)
  try {
    const response = await fetch(
      `/api/workspaces/${workspaceId}/staging/add`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signalType: "competitor_weakness",
          content: competitor.weakness, // e.g., "Lacks dark mode"
          source: "competitor_spy",
          sourceAppId: appId,
          sourceContextId: competitor.id,
          language: competitor.language || "en",
          metadata: {
            competitorName: competitor.name,
            category: competitor.category,
          },
        }),
      }
    )

    if (response.ok) {
      showToast(`Staged: ${competitor.weakness}`, "success")
      // Stay in current page, don't navigate
    } else {
      showToast("Failed to stage signal", "error")
    }
  } finally {
    setLoading(false)
  }
}

return (
  <button onClick={handleSendToVault} disabled={loading}>
    {loading ? "Staging..." : "Stage for Optimizer"}
  </button>
)
```

### 3. Refactor All "Send to Optimizer" Button Locations

**Reviews & Common Issues Page:**
```typescript
// Stage review issue
await fetch(`/api/workspaces/${workspaceId}/staging/add`, {
  method: "POST",
  body: JSON.stringify({
    signalType: "review_issue",
    content: issue.description, // e.g., "Users report crashes on older devices"
    source: "review_analysis",
    sourceAppId: appId,
    sourceContextId: issue.id,
    language: issue.language || "en",
    metadata: {
      category: issue.category, // "Crashes", "Performance", etc
      frequency: issue.frequency,
      reviewScore: issue.reviewScore,
    },
  }),
})
```

**Keyword Tracker / Market Intelligence:**
```typescript
// Stage keyword
await fetch(`/api/workspaces/${workspaceId}/staging/add`, {
  method: "POST",
  body: JSON.stringify({
    signalType: "keyword",
    content: keyword, // e.g., "dark mode", "offline sync"
    source: "keyword_tracker", // or "keyword_spotlight"
    sourceAppId: appId,
    language: locale, // from useLocale()
    metadata: {
      searchVolume: keyword.searchVolume,
      difficulty: keyword.difficulty,
      source: "competitor_analysis",
    },
  }),
})
```

### 4. Add Staging Vault Dashboard (Optional)

Show user a quick view of their staging vault:

```typescript
// components/StagingVaultPreview.tsx
export function StagingVaultPreview({ workspaceId, appId }: { workspaceId: string; appId: string }) {
  const [vault, setVault] = useState<AppVaultContext | null>(null)

  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/staging/list?appId=${appId}`)
      .then((r) => r.json())
      .then((r) => setVault(r.data))
  }, [])

  if (!vault?.hasVaultContent) {
    return <p>No signals staged yet. Use "Stage for Optimizer" to add signals.</p>
  }

  return (
    <div className="vault-preview">
      <h3>Staging Vault ({vault.totalSignals} signals)</h3>
      {vault.keywords.length > 0 && (
        <div>
          <strong>Keywords:</strong> {vault.keywords.map((k) => k.content).join(", ")}
        </div>
      )}
      {vault.reviewIssues.length > 0 && (
        <div>
          <strong>Issues:</strong> {vault.reviewIssues.map((i) => i.content).join(", ")}
        </div>
      )}
      {vault.competitorWeaknesses.length > 0 && (
        <div>
          <strong>Weaknesses:</strong> {vault.competitorWeaknesses.map((w) => w.content).join(", ")}
        </div>
      )}
      <button onClick={() => router.push(`/app/${appId}/listing-optimizer?useVault=true`)}>
        Generate Listing from Vault
      </button>
    </div>
  )
}
```

---

## Pillar Integration (Step 4)

### Brand Mirror Engine Integration

Update screenshot generation to use vault context:

```typescript
// lib/screenshot/generate-screenshot-pack.ts
import { getAppVaultContext } from "@/lib/staging-vault/staging-vault-service"

async function generateScreenshotPack(
  client: GoogleGenerativeAI,
  appId: string,
  workspaceId: string,
  // ... other params
) {
  // Get vault context
  const vaultContext = await getAppVaultContext(supabase, workspaceId, appId)

  // Build prompt including vault signals
  const vaultKeywords = vaultContext.keywords.map((k) => k.content).join(", ")

  const prompt = `
    You are generating app screenshots for: ${appName}
    
    STAGING VAULT CONTEXT:
    - Keywords to emphasize: ${vaultKeywords}
    - Review issues to address: ${vaultContext.reviewIssues.map((i) => i.content).join(", ")}
    - Competitor weaknesses to differentiate: ${vaultContext.competitorWeaknesses.map((w) => w.content).join(", ")}
    
    Use these signals as mandatory constraints in the 6-slide narrative.
  `

  // Continue with generation
}
```

### Consultant Layer Integration

Update roadmap generation to consume vault:

```typescript
// lib/consultant/strategy-generator.ts
import { getAppVaultContext } from "@/lib/staging-vault/staging-vault-service"

async function generateGrowthRoadmap(
  client: GoogleGenerativeAI,
  appId: string,
  workspaceId: string,
  // ... other params
) {
  // Get vault context as primary input
  const vault = await getAppVaultContext(supabase, workspaceId, appId)

  const prompt = `
    Generate a 30-day growth roadmap.
    
    PRIMARY CONTEXT (from Staging Vault):
    - Staged keywords: ${vault.keywords.map((k) => k.content).join(", ")}
    - Staged review issues: ${vault.reviewIssues.map((i) => i.content).join(", ")}
    - Staged competitor gaps: ${vault.competitorWeaknesses.map((w) => w.content).join(", ")}
    
    Use vault signals as the foundation for tactics.
  `

  // Continue with generation
}
```

---

## RTL/LTR Parity Verification

**Database Level:**
- `language` column stores exact language code (en, ar, he, etc)
- `is_rtl` auto-set on insert based on language
- `content` UTF-8 fully preserved (no transformation)

**API Level:**
- All responses include `language` and `is_rtl` for each signal
- Content returned exactly as stored
- No text direction normalization

**Frontend Level:**
```typescript
// Use isRtl flag to render correctly
<div dir={signal.is_rtl ? "rtl" : "ltr"} lang={signal.language}>
  {signal.content}
</div>
```

---

## Implementation Checklist

### Frontend (Step 3 - Your Work)
- [ ] Create `hooks/useToast.ts` (toast notification hook)
- [ ] Create `components/Toast.tsx` (UI component)
- [ ] Refactor "Send to Optimizer" button on Spy page → `handleSendToVault`
- [ ] Refactor "Send to Optimizer" button on Reviews page
- [ ] Refactor "Send to Optimizer" button on Market Intelligence page
- [ ] Add `components/StagingVaultPreview.tsx` (optional dashboard)
- [ ] Test Arabic + English signals preservation
- [ ] Test toast notifications appear/disappear
- [ ] Test signals appear in Brand Mirror Engine generation
- [ ] Test signals appear in Consultant Layer roadmap

### Integration (Step 4 - After Frontend)
- [ ] Wire `Brand Mirror Engine` to call `getAppVaultContext()`
- [ ] Wire `Consultant Layer` to call `getAppVaultContext()`
- [ ] Test end-to-end: Stage signal → Generate → Signal appears in output
- [ ] Test RTL signals (Arabic) flow through generation
- [ ] Test LTR signals (English) flow through generation

---

## Testing Strategy

### Unit Tests (Frontend)
```typescript
describe("Staging Vault", () => {
  it("sends keyword signal to vault", async () => {
    // Mock API, verify POST called with correct payload
  })

  it("shows success toast after staging", async () => {
    // Mock fetch, verify toast appears and disappears
  })

  it("preserves Arabic content exactly", () => {
    // Send Arabic text, verify it comes back unchanged
  })
})
```

### Integration Tests
```typescript
describe("Staging Vault → Generation", () => {
  it("Brand Mirror Engine uses vault keywords", async () => {
    // Stage keyword, generate screenshots, verify keyword appears
  })

  it("Consultant Layer includes vault signals in roadmap", async () => {
    // Stage competitor weakness, generate roadmap, verify tactic addresses it
  })
})
```

---

## Key Files Summary

| File | Purpose | Status |
|------|---------|--------|
| `supabase/migrations/20260604100100_workspace_staging_vault.sql` | DB schema | ✅ Done |
| `lib/staging-vault/staging-vault-service.ts` | Service layer | ✅ Done |
| `app/api/workspaces/[id]/staging/add/route.ts` | POST endpoint | ✅ Done |
| `app/api/workspaces/[id]/staging/list/route.ts` | GET endpoint | ✅ Done |
| `hooks/useToast.ts` | Toast hook | ⏳ Frontend |
| `components/Toast.tsx` | Toast UI | ⏳ Frontend |
| Button refactors (Spy, Reviews, Intel) | UI changes | ⏳ Frontend |
| `components/StagingVaultPreview.tsx` | Optional dashboard | ⏳ Frontend |

---

## Success Criteria

✅ **Database:** Signals persist across page navigations  
✅ **API:** POST/GET endpoints work with all signal types  
✅ **Notifications:** Toast appears/disappears correctly  
✅ **Pillar Integration:** Brand Mirror & Consultant use vault context  
✅ **RTL/LTR:** Arabic signals preserved exactly (dir="rtl", language="ar")  
✅ **UX:** Users don't lose signals when navigating  

---

## What's Next

1. **Apply migration:** Run Supabase migration
2. **Frontend refactor:** Implement Step 3 (Toast + button changes)
3. **Integration testing:** Verify Brand Mirror & Consultant consume vault
4. **Launch:** Remove old "Send to Optimizer" navigation pattern

---

**Status:** 🟢 Database & API Ready | ⏳ Frontend Pending | Ready for your implementation
