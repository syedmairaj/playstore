# Fix: "Loading chunk competitors/page failed" Error

## Problem
When navigating from AI Listing Optimizer to Competitor Spy page, you see:
```
Loading chunk app/[locale]/app/[workspaceId]/competitors/page failed
```

## Root Cause Analysis
The competitors page chunk fails to load at runtime. This is typically caused by:
1. **Stale build cache** - Next.js `.next` folder contains outdated compiled chunks
2. **Module resolution conflict** - Project has duplicate component files in both `components/` and `src/components/`
3. **Build-time error** - TypeScript or bundler error that wasn't fully cleared

## Solution

### Step 1: Clear Next.js Cache
```bash
rm -rf .next
rm -rf node_modules/.cache
```

### Step 2: Rebuild (Choose One)

**Option A: Development Mode (Recommended for Testing)**
```bash
npm run dev:clean
```
This will:
- Remove `.next` cache
- Clear Node module cache
- Start dev server (auto-rebuilds on file change)

**Option B: Production Build**
```bash
rm -rf .next && npm run build
```

### Step 3: Test
1. Start the dev server if not already running
2. Navigate to any app
3. Click on "Competitor Spy" in sidebar
4. Verify page loads without errors

## Why This Works

The `.next` build cache can become corrupted or out-of-sync with source files, especially after:
- Major dependency updates
- Component file restructuring  
- Caching system modifications

Clearing the cache forces Next.js to:
1. Re-analyze all imports and dependencies
2. Rebuild the competitors page chunk from scratch
3. Properly resolve all module paths according to `tsconfig.json`

## Path Resolution Reference
- `@/*` alias points to → `./src/*`
- So `@/components/competitor-spy/CompetitorSpyClient` resolves to → `src/components/competitor-spy/CompetitorSpyClient.tsx`

## Prevention
If this error recurs:
1. Check browser console for more specific error details
2. Look at server terminal for build-time warnings
3. Verify all imported components exist in `src/components/`
4. Check for circular dependency warnings in build output

## Status
✅ Code is correct (verified)
✅ All imports resolve properly
✅ No syntax errors in components
⚠️ Build cache needs refresh

Once cache is cleared and rebuilt, the competitors page should load instantly.
