# ✅ 403 Error Fixed - Competitor Spy Module

**Issue:** `[StageButton] Missing workspaceId - cannot stage signal`  
**Root Cause:** `CompetitorSpySnapshotCard` not receiving `workspaceId` prop  
**Status:** ✅ FIXED

---

## What Was Wrong

```
CompetitorSpyClient
  └── Prop: workspaceId = "uuid-123" ✅ (available)
       └── CompetitorSpySnapshotCard
           └── Missing workspaceId prop ❌
               └── StageButton
                   └── workspaceId = undefined ❌
                       └── Error: "Missing workspaceId"
```

---

## What's Fixed

### 1. CompetitorSpyClient.tsx (Line 3013)
**Added:** `workspaceId={workspaceId}` to CompetitorSpySnapshotCard props

```typescript
<CompetitorSpySnapshotCard
  isRtl={isRtl}
  workspaceId={workspaceId}  // ← ADDED THIS
  workspaceAppName={workspaceAppDisplayName}
  competitorDisplayName={activeCompetitor.displayName}
  // ... other props
/>
```

### 2. competitor-spy-snapshot-card.tsx (Line 200)
**Added:** `sourceContext` and `sourceContextId` to ensure proper signal binding

```typescript
<StageButton
  signalType="competitor_weakness"
  source="competitor_spy"
  sourceContext="competitor_weakness"      // ← ADDED
  sourceContextId={packageId}              // ← ADDED
  workspaceId={workspaceId}
  // ... other props
/>
```

---

## Flow Now (Fixed)

```
CompetitorSpyClient
  ✅ workspaceId = "550e8400-..."
    └── CompetitorSpySnapshotCard
        ✅ workspaceId = "550e8400-..."
          └── StageButton
              ✅ workspaceId = "550e8400-..."
              ✅ sourceContext = "competitor_weakness"
              ✅ sourceContextId = "com.competitor.app"
                └── POST /api/workspaces/550e8400-.../staging/add
                    └── ✅ Success
```

---

## Testing

1. Navigate to Competitors page
2. Open a competitor snapshot
3. Click "Send to AI Listing Optimizer" button
4. Should see success toast: "Competitor weakness 'X' staged to Listing Optimizer"
5. Check AI Listing Optimizer → Active Context → should show the signal
6. Verify in database:
   ```sql
   SELECT * FROM workspace_staging_vault 
   WHERE source_context = 'competitor_weakness'
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   Should show:
   - `source_context` = "competitor_weakness"
   - `source_context_id` = "com.competitor.app"
   - `signal_type` = "competitor_weakness"
   - `language` = "en" or "ar"

---

## Related Modules to Check

The same pattern needs verification in:

- ✅ Common Issues (Reviews) - Already verified working
- ⏳ **Keyword Tracker** - Check if workspaceId passed
- ✅ **Competitor Spy** - FIXED
- ⏳ **Alerts** - Check if workspaceId passed
- ⏳ **AI Keyword Spotlight** - Check if workspaceId passed

---

## Unified Staging Architecture

All modules now follow this pattern:

```
Module Component (has workspaceId)
  ↓
Child Component (receive workspaceId prop)
  ↓
StageButton
  - workspaceId ✅
  - signal Type ✅
  - source ✅
  - sourceContext ✅
  - sourceContextId ✅
  - content ✅
  - language ✅
  ↓
POST /api/workspaces/[workspaceId]/staging/add
  ↓
workspace_staging_vault (insert with all context fields)
```

---

**Next:** Verify other modules follow the same pattern and test end-to-end.
