# API Verification Checklist - MUST DO FIRST

**Status:** Before implementing frontend, verify these API endpoints work  
**Priority:** CRITICAL - If APIs don't work, frontend changes won't matter  
**Time:** 15-20 minutes

---

## Overview

Three API endpoints are required for the staging system to work:

1. **POST /api/workspaces/[id]/staging/add** - Stage a signal to vault (EXISTS ✓)
2. **GET /api/workspaces/[id]/optimizer/context** - Fetch optimizer context (CHECK)
3. **POST /api/workspaces/[id]/optimizer/sync** - Sync vault with optimizer (CHECK)

---

## Step 1: Test POST /api/workspaces/[id]/staging/add

**Location:** Already implemented in `/app/api/workspaces/[workspaceId]/staging/add/route.ts`

### Test in Browser Console

```javascript
// In your app's browser console (F12 → Console):

const workspaceId = "e8408dba-a0d5-49ce-a88c-6759b01b2ff1/"; // Copy from URL
const appId = "b76a1145-888a-43d2-bf05-5ebd953610d6"; // Copy from app selector

fetch(`/api/workspaces/${workspaceId}/staging/add`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    signalType: "review_issue",
    content: "Test Issue - App Crashes",
    source: "review_analysis",
    sourceAppId: appId,
    language: "en",
    metadata: {
      description: "Test issue for staging vault verification",
      severity: "critical",
      impactPercent: 13,
    }
  })
})
  .then(r => r.json())
  .then(data => {
    console.log("✅ API Response:", data);
    console.log("Status should be 200");
  })
  .catch(err => console.error("❌ Error:", err));
```

### Expected Response (✅ SUCCESS)

```json
{
  "ok": true,
  "data": {
    "id": "uuid-here",
    "workspace_id": "workspace-id",
    "signal_type": "review_issue",
    "content": "Test Issue - App Crashes",
    "source": "review_analysis",
    "created_at": "2026-06-04T...",
    "metadata": { ... }
  }
}
```

### Error Response (❌ FAIL)

```json
{
  "ok": false,
  "error": {
    "code": "unauthorized" | "forbidden" | "validation" | "server_error",
    "message": "..."
  }
}
```

### What Each Error Means

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `unauthorized` | Not logged in | Sign in first |
| `forbidden` | Not a workspace member | Use correct workspaceId |
| `validation` | Bad request body | Check JSON format |
| `server_error` | Backend crashed | Check server logs |

---

## Step 2: Verify Data in Supabase

After successful API call, check the database:

1. **Open Supabase Dashboard**
2. **Go to:** `workspace_staging_vault` table
3. **Look for:** Most recent row with your test data
4. **Verify columns:**
   - ✓ `id` (UUID)
   - ✓ `workspace_id` (matches your workspace)
   - ✓ `signal_type` = "review_issue"
   - ✓ `content` = "Test Issue - App Crashes"
   - ✓ `source` = "review_analysis"
   - ✓ `metadata` (has description, severity, impactPercent)
   - ✓ `created_at` (recent timestamp)

**If data is NOT there:** API returned success but didn't save. Backend bug.

---

## Step 3: Test GET /api/workspaces/[id]/optimizer/context

This endpoint should return the staging vault context.

### Check Endpoint Exists

```javascript
// In browser console:
const workspaceId = "YOUR_WORKSPACE_ID";

fetch(`/api/workspaces/${workspaceId}/optimizer/context`)
  .then(r => {
    console.log("Status:", r.status);
    return r.json();
  })
  .then(data => console.log("Response:", data))
  .catch(err => console.error("Error:", err));
```

### Expected Behavior

**If endpoint EXISTS (✓):**
```json
{
  "activeItems": [
    {
      "id": "...",
      "signalType": "review_issue",
      "content": "Test Issue - App Crashes",
      "source": "review_analysis",
      "stagedAt": "2026-06-04T...",
      "metadata": { ... }
    }
  ],
  "archivedItems": [],
  "stats": {
    "totalStaged": 1,
    "totalArchived": 0,
    "lastSyncAt": "2026-06-04T..."
  }
}
```

**If endpoint DOESN'T EXIST (❌):**
```
404 Not Found
```

### If 404: Create the Endpoint

If you get 404, the endpoint needs to be created:

**File:** Create `/app/api/workspaces/[workspaceId]/optimizer/context/route.ts`

**Code:**
```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  // Fetch all staged items from workspace_staging_vault
  const { data: stagedItems } = await supabase
    .from("workspace_staging_vault")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  const activeItems = (stagedItems || [])
    .filter(item => !item.archived_at)
    .map(item => ({
      id: item.id,
      signalType: item.signal_type,
      content: item.content,
      source: item.source,
      stagedAt: item.created_at,
      metadata: item.metadata || {}
    }));

  const archivedItems = (stagedItems || [])
    .filter(item => item.archived_at)
    .map(item => ({
      id: item.id,
      signalType: item.signal_type,
      archivedAt: item.archived_at,
      archivedReason: item.archived_reason || "archived"
    }));

  return NextResponse.json({
    activeItems,
    archivedItems,
    stats: {
      totalStaged: activeItems.length,
      totalArchived: archivedItems.length,
      lastSyncAt: new Date().toISOString()
    }
  });
}
```

---

## Step 4: Test POST /api/workspaces/[id]/optimizer/sync

This endpoint triggers a sync between vault and optimizer.

### Test in Console

```javascript
const workspaceId = "YOUR_WORKSPACE_ID";

fetch(`/api/workspaces/${workspaceId}/optimizer/sync`, {
  method: "POST",
  headers: { "Content-Type": "application/json" }
})
  .then(r => {
    console.log("Status:", r.status);
    return r.json();
  })
  .then(data => console.log("Response:", data))
  .catch(err => console.error("Error:", err));
```

### Expected Response

```json
{
  "success": true,
  "syncedAt": "2026-06-04T...",
  "itemsProcessed": 1
}
```

### If 404: Create the Endpoint

**File:** Create `/app/api/workspaces/[workspaceId]/optimizer/sync/route.ts`

**Code:**
```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function POST(request: Request, context: Ctx) {
  const { workspaceId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  // Sync logic: fetch staged items and process them
  const { data: stagedItems } = await supabase
    .from("workspace_staging_vault")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("archived_at", null);

  // Process items (update optimizer context, etc.)
  // For now, just count them
  const itemsProcessed = (stagedItems || []).length;

  return NextResponse.json({
    success: true,
    syncedAt: new Date().toISOString(),
    itemsProcessed
  });
}
```

---

## Complete Testing Checklist

### Checklist: API Endpoints

- [ ] **POST /staging/add**
  - [ ] Call with review_issue payload
  - [ ] Get 200 OK response
  - [ ] Data appears in Supabase table
  - [ ] Metadata stored correctly

- [ ] **GET /optimizer/context**
  - [ ] Endpoint exists (not 404)
  - [ ] Returns activeItems array
  - [ ] Returns archivedItems array
  - [ ] Returns stats object
  - [ ] Shows staged issue in activeItems

- [ ] **POST /optimizer/sync**
  - [ ] Endpoint exists (not 404)
  - [ ] Returns success: true
  - [ ] Shows itemsProcessed count
  - [ ] Can be called without errors

### Checklist: Data Flow

- [ ] Stage a review issue via API
- [ ] Check Supabase table has new row
- [ ] Call /optimizer/context
- [ ] See issue in activeItems array
- [ ] Call /optimizer/sync
- [ ] Get success response

### Checklist: Error Handling

- [ ] Call API without auth → 401
- [ ] Call API with wrong workspaceId → 403
- [ ] Call API with bad JSON → 400/422
- [ ] Each error has clear message

---

## Network Tab Verification

Once endpoints are verified, test with **Network Tab**:

1. **Open DevTools (F12)**
2. **Click Network tab**
3. **Click "Stage Issue" button** (after implementing)
4. **Look for POST request to `/staging/add`**
5. **Verify:**
   - ✓ Status: 200 (green)
   - ✓ Request body: has correct metadata
   - ✓ Response: contains issue data with ID

---

## Summary Table

| Endpoint | Purpose | Status | Fix Needed? |
|----------|---------|--------|------------|
| `POST /staging/add` | Save issue to vault | Exists | Check if returns 200 |
| `GET /optimizer/context` | Get staged items | ? | Create if missing |
| `POST /optimizer/sync` | Trigger sync | ? | Create if missing |

---

## Next: After APIs Are Verified

Once all three endpoints work:
1. All tests pass
2. Data appears in Supabase
3. Network requests show 200 status
4. Response format is correct

**THEN:** Proceed to Reviews Module Implementation

---

**Do not skip this step.** If APIs don't work, the frontend implementation will fail silently.
