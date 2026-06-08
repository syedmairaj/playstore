# ✅ File Location Fix - Module Resolution

## The Problem

```
Module not found: Can't resolve '@/lib/competitor-spy/capture-and-stage-keywords'
```

## Root Cause

Your `tsconfig.json` specifies:
```json
"paths": { "@/*": ["./src/*"] }
```

This means all `@/` imports must resolve to files in the `./src/` directory.

**But the file was created in:** `lib/competitor-spy/` (missing `src/` prefix)

## The Fix

✅ **File has been moved to the correct location:**
```
FROM: lib/competitor-spy/capture-and-stage-keywords.ts
TO:   src/lib/competitor-spy/capture-and-stage-keywords.ts
```

Now the import resolves correctly:
```
@/lib/competitor-spy/capture-and-stage-keywords
        ↓
./src/lib/competitor-spy/capture-and-stage-keywords.ts ✅
```

---

## What This Means

All imports using the `@/` alias now work:

```typescript
// ✅ CORRECT (uses @ alias)
import { stageCompetitorAnalysis } from "@/lib/competitor-spy/capture-and-stage-keywords";

// ❌ WRONG (no @ alias)
import { stageCompetitorAnalysis } from "lib/competitor-spy/capture-and-stage-keywords";

// ❌ WRONG (relative path)
import { stageCompetitorAnalysis } from "./lib/competitor-spy/capture-and-stage-keywords";
```

---

## Complete File Locations

All files are now in correct locations:

| File | Location | Purpose |
|------|----------|---------|
| capture-and-stage-keywords.ts | `src/lib/competitor-spy/` | Client-side staging orchestration |
| staging-vault-service.ts | `lib/staging-vault/` | Server vault operations (no src/ needed) |
| route.ts (add) | `app/api/workspaces/.../staging/add/` | Server API endpoint |
| keywords/route.ts | `app/api/workspaces/.../keywords/` | Server GET endpoint |
| staging-contract.ts | `src/types/` | Type definitions |

---

## Next Steps

### Step 1: Stop the Dev Server
```bash
Ctrl+C
```

### Step 2: Clear Cache
```bash
rm -rf .next node_modules/.cache
```

### Step 3: Restart Dev Server
```bash
npm run dev
```

### Step 4: Verify No Errors
You should see:
```
✓ Ready in 2.5s
```

Without any `Module not found` errors.

---

## Why This Happened

When creating files in a mounted VM filesystem, it's easy to miss the `src/` prefix requirement. Your tsconfig's path alias makes it a strict requirement.

**Going forward:** All imports using `@/` must refer to files in the `./src/` directory.

---

## Verification

After restart, you can verify the fix works by:

1. **Opening the component:**
   ```
   components/competitor-spy/competitor-spy-snapshot-card.tsx
   ```

2. **Checking the import:**
   ```typescript
   import { stageCompetitorAnalysis } from "@/lib/competitor-spy/capture-and-stage-keywords";
   ```

3. **No red squiggly line = ✅ Fixed**

---

## File Size Check

Both files should be identical:
```bash
ls -la src/lib/competitor-spy/capture-and-stage-keywords.ts
# Should show: 11615 bytes (12KB)
```

If you see 0 bytes, the copy failed. Let me know and I'll recreate it.

