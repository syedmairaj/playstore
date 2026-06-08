# Module Not Found: capture-and-stage-keywords

## The Issue

```
Module not found: Can't resolve '@/lib/competitor-spy/capture-and-stage-keywords'
```

**But the file EXISTS:**
- Location: `/lib/competitor-spy/capture-and-stage-keywords.ts`
- Size: 12KB
- Export: `stageCompetitorAnalysis` function (verified ✅)

## Root Cause

This is a **Next.js development server cache issue**. The file was created/updated in the VM filesystem, but Next.js' internal cache hasn't refreshed.

## Solution: Complete Clean Start

### Step 1: Stop Next.js
Press `Ctrl+C` in the terminal where `npm run dev` is running.

### Step 2: Clean All Caches
```bash
rm -rf .next node_modules/.cache
```

### Step 3: Restart Development Server
```bash
npm run dev
```

This forces Next.js to:
- Rebuild the project
- Re-scan all modules
- Re-initialize the module cache
- Re-resolve all imports

---

## Why This Happened

When files are created in a mounted VM filesystem, the development server might not immediately detect them. A complete restart forces Next.js to scan the filesystem fresh.

---

## Verification

After restart, you should see:
```
 ✓ Ready in 2.5s
```

Without any `Module not found` errors.

---

## If Issue Persists

If you still see the error after restart:

1. **Verify the file path matches tsconfig:**
   ```json
   "paths": { "@/*": ["./src/*"] }
   ```
   The import `@/lib/competitor-spy/...` should resolve to `./src/lib/competitor-spy/...`

2. **Check if file is in the right location:**
   ```bash
   ls -la lib/competitor-spy/capture-and-stage-keywords.ts
   ls -la src/lib/competitor-spy/capture-and-stage-keywords.ts
   ```
   File should be in **`src/lib/competitor-spy/`** (not just `lib/`)

3. **Check the import path in the component:**
   ```
   @/lib/competitor-spy/capture-and-stage-keywords  ✅ Correct
   lib/competitor-spy/capture-and-stage-keywords    ❌ Wrong (missing @/)
   ./lib/competitor-spy/capture-and-stage-keywords  ❌ Wrong (relative)
   ```

---

## Quick Command

Run this after stopping the dev server:
```bash
rm -rf .next node_modules/.cache && npm run dev
```

This clears the cache and restarts in one command.

