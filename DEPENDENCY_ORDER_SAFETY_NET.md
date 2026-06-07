
# Critical: Dependency Order & Safety Net
**Purpose:** Ensure safe integration without breaking anything  
**Status:** Read BEFORE starting Phase 1  
**Impact:** Prevents cascading failures

---

## 🎯 The Order of Operations (Critical!)

### Why Order Matters

If you install files in the wrong order, you get circular dependencies or import errors. **THIS ORDER IS NOT OPTIONAL.**

---

## 📋 Correct Installation Sequence

### Step 1: Type Definitions FIRST
**File:** `src/types/staging-contract.ts`

**Why first:**
- No dependencies on other files
- Everything else imports from this
- If this breaks, everything breaks

**Check:**
```bash
npx tsc --noEmit src/types/staging-contract.ts
# Should compile with ZERO errors
```

---

### Step 2: Utility Functions SECOND
**File:** `src/lib/staging-utilities.ts`

**Why second:**
- Only depends on types (already installed)
- Utilities are pure functions
- Hook will import these

**Check:**
```bash
npx tsc --noEmit src/lib/staging-utilities.ts
# Should compile with ZERO errors
```

---

### Step 3: React Hook THIRD
**File:** `src/hooks/useStaging.ts`

**Why third:**
- Depends on types ✓ (installed)
- Depends on utilities ✓ (installed)
- Components will import this

**Check:**
```bash
npx tsc --noEmit src/hooks/useStaging.ts
# Should compile with ZERO errors
# May have warnings about useToast, that's OK
```

---

### Step 4: Button Component LAST
**File:** `src/components/staging/StagingButton.tsx`

**Why last:**
- Depends on everything else
- Only file that depends on it is your modules
- Can test in isolation

**Check:**
```bash
npx tsc --noEmit src/components/staging/StagingButton.tsx
# Should compile with ZERO errors
```

---

## 🔄 Dependency Graph (Visual)

```
┌─ src/types/staging-contract.ts ─┐
│  (No dependencies)                │
│  Exports: Types, helpers          │
└────────────┬──────────────────────┘
             │ ↑
             │ (imported by all others)
             ↓
┌────────────────────────────────┐
│ src/lib/staging-utilities.ts   │
│ (Depends on: types only)        │
│ Exports: Builders, validators   │
└────────────┬───────────────────┘
             │ ↑
             │ (imported by hook & components)
             ↓
┌────────────────────────────────┐
│ src/hooks/useStaging.ts        │
│ (Depends on: types, utilities)  │
│ Exports: useStaging() hook      │
└────────────┬───────────────────┘
             │ ↑
             │ (imported by components)
             ↓
┌────────────────────────────────┐
│ src/components/staging/        │
│ StagingButton.tsx              │
│ (Depends on: types, utils, hook)│
│ Exports: StagingButton component│
└────────────────────────────────┘
```

---

## ✅ Verification Checklist

### After Each File Installation

| File | Step | Command | Expected |
|------|------|---------|----------|
| `staging-contract.ts` | 1 | `npx tsc --noEmit src/types/staging-contract.ts` | ✓ 0 errors |
| `staging-utilities.ts` | 2 | `npx tsc --noEmit src/lib/staging-utilities.ts` | ✓ 0 errors |
| `useStaging.ts` | 3 | `npx tsc --noEmit src/hooks/useStaging.ts` | ✓ 0 errors |
| `StagingButton.tsx` | 4 | `npx tsc --noEmit src/components/staging/StagingButton.tsx` | ✓ 0 errors |
| **All together** | Done | `npm run build` | ✓ 0 errors |

---

## 🛡️ Safety Net 1: Incremental Testing

### Test After Each File

**After installing Step 1 (types):**
```bash
npx tsc --noEmit src/types/staging-contract.ts
```
**Expected:** ✓ Compiles

---

**After installing Step 2 (utils):**
```bash
npx tsc --noEmit src/lib/staging-utilities.ts
```
**Expected:** ✓ Compiles

---

**After installing Step 3 (hook):**
```bash
npx tsc --noEmit src/hooks/useStaging.ts
```
**Expected:** ✓ Compiles (useToast warning is OK)

---

**After installing Step 4 (button):**
```bash
npx tsc --noEmit src/components/staging/StagingButton.tsx
npm run build
```
**Expected:** ✓ Compiles, ✓ Build succeeds

---

## 🛡️ Safety Net 2: Dependency Verification

### Before Moving to Phase 2

Run this final check:

```bash
# 1. Full build
npm run build
# Should succeed with NO errors

# 2. Type check all files
npx tsc --noEmit \
  src/types/staging-contract.ts \
  src/lib/staging-utilities.ts \
  src/hooks/useStaging.ts \
  src/components/staging/StagingButton.tsx
# Should show 0 errors

# 3. Check for circular dependencies
npm install depcruise --save-dev
npx depcruise --exclude "node_modules" src/
# Should not show any circular dependencies

# 4. Run your test harness
npm run dev
# Navigate to test page
# Should render without errors
```

---

## 🛡️ Safety Net 3: Import Path Verification

### Common Import Errors

**Error:** `Cannot find module '@/hooks/useToast'`
```typescript
// Check if file exists:
ls -la src/hooks/useToast.ts

// If not, you need to:
// Option 1: Implement useToast hook
// Option 2: Update import path in useStaging.ts

// To find correct path:
find src -name "*toast*" -type f
```

**Error:** `Cannot find module '@/lib/utils'`
```typescript
// Check if file exists:
ls -la src/lib/utils.ts

// If not, you need to implement cn function or update import path

// Implement quickly:
// src/lib/utils.ts
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
```

**Error:** `Cannot find module 'next-intl'`
```typescript
// Install it:
npm install next-intl

// Or replace useLocale with your method:
// In useStaging.ts, replace:
// const locale = useLocale() as LanguageCode;
// With:
// const locale = 'en'; // or your detection method
```

---

## 🛡️ Safety Net 4: Rollback Strategy

If something breaks during installation:

### Quick Rollback (< 1 minute)

```bash
# Delete the problematic file
rm src/components/staging/StagingButton.tsx

# Or delete all 4 files
rm src/types/staging-contract.ts
rm src/lib/staging-utilities.ts
rm src/hooks/useStaging.ts
rm src/components/staging/StagingButton.tsx

# Restore from backup
git checkout src/

# Verify build
npm run build
# Should succeed
```

### If You Can't Rollback

```bash
# Remove imports from other files
# Edit any file that imports staging files
# Comment out the imports
# Run npm run build

# Then:
# 1. Diagnose the issue
# 2. Fix in the staging file
# 3. Uncomment imports
# 4. Test again
```

---

## 🛡️ Safety Net 5: Symptom Diagnosis

### If Build Fails

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `Cannot find module` | Import path wrong | Verify file exists at path |
| `Type 'X' not found` | Type not exported | Check export in source file |
| `Unexpected token` | Syntax error | Check file didn't copy incorrectly |
| `Circular dependency` | Wrong import order | Follow correct order above |
| `Property not found on type` | Incompatible version | Update type definitions |

---

## 🛡️ Safety Net 6: No Modules Refactored Yet

**CRITICAL:** During Phase 1, you will:

- ✅ Copy 4 core files
- ✅ Test them in isolation
- ✅ Verify they work correctly
- ❌ NOT refactor any existing modules
- ❌ NOT modify Competitor Spy yet
- ❌ NOT break any existing functionality

**Old modules still work.** New files exist side-by-side. **Zero risk.**

---

## 🛡️ Safety Net 7: Git Checkpoints

Create git commits at each milestone:

```bash
# After Step 1 (types only)
git add src/types/staging-contract.ts
git commit -m "feat: add unified staging payload types"

# After Step 2 (types + utils)
git add src/lib/staging-utilities.ts
git commit -m "feat: add staging utility functions"

# After Step 3 (types + utils + hook)
git add src/hooks/useStaging.ts
git commit -m "feat: add useStaging react hook"

# After Step 4 (all 4 files)
git add src/components/staging/StagingButton.tsx
git commit -m "feat: add universal StagingButton component"

# Create a restore point before Phase 2
git tag -a phase-1-complete -m "Phase 1: Core files installed and tested"
```

### If Things Break Later

```bash
# Revert to Phase 1 (before any module changes)
git reset --hard phase-1-complete

# Or go back one commit
git revert HEAD
```

---

## 🛡️ Safety Net 8: Parallel Version Pattern

During refactoring, keep this pattern:

```typescript
// OLD: StageCompetitorSpyOld() { ... }
// NEW: StageCompetitorSpyNew() { ... }
// EXPORT: CompetitorSpySnapshotCard = StageCompetitorSpyOld;

// To switch:
// export const CompetitorSpySnapshotCard = StageCompetitorSpyNew;

// To revert:
// export const CompetitorSpySnapshotCard = StageCompetitorSpyOld;
```

**Benefits:**
- ✅ Test both simultaneously
- ✅ Switch with 1 line change
- ✅ Revert with 1 line change
- ✅ Compare outputs directly
- ✅ Zero downtime

---

## 📋 Pre-Phase-1 Checklist

Before you copy any files, verify ALL of these:

### Environment Setup
- [ ] Node.js version >= 16
- [ ] npm version >= 8
- [ ] TypeScript installed (`npm install -D typescript`)
- [ ] React version >= 16.8
- [ ] Next.js version >= 12 (if using Next.js)

### Dependencies Installed
- [ ] `npm install next-intl` (or equivalent)
- [ ] `npm install lucide-react`
- [ ] `npm install -D typescript`
- [ ] Check `@/hooks/useToast` exists (or plan to create)
- [ ] Check `@/lib/utils` exists (or plan to create)

### Project Structure
- [ ] `src/types/` directory exists (or create it)
- [ ] `src/hooks/` directory exists (or create it)
- [ ] `src/lib/` directory exists (or create it)
- [ ] `src/components/` directory exists
- [ ] `src/components/staging/` directory exists or you'll create it

### Development Setup
- [ ] Can run `npm run build` successfully
- [ ] Can run `npm run dev` successfully
- [ ] Can open browser to `localhost:3000`
- [ ] Can open DevTools console (F12)
- [ ] Git is initialized (`git status` works)

### Knowledge
- [ ] Read `ARCHITECTURE_SUMMARY.md` (understand design)
- [ ] Read `QUICK_START.md` (understand usage)
- [ ] Understand your current staging implementation
- [ ] Know where Competitor Spy module is located
- [ ] Know how language is currently detected in your app

---

## 🚀 Green Light Checklist

Only proceed to Phase 1 if ALL boxes are checked:

- [x] All 4 core files are ready to copy
- [x] All dependencies are installed
- [x] Project structure is ready
- [x] Can run `npm run build`
- [x] Understand the architecture
- [x] Know the correct order of operations
- [x] Know how to rollback if needed
- [x] Know where current implementation is
- [x] Have backup strategy (`git checkout`)
- [x] Have diagnostic tools ready (DevTools, logs, database)

---

## 🎯 Success Metrics for Phase 1

### Minimum Success
- [x] 4 files installed in correct order
- [x] `npm run build` succeeds (no errors)
- [x] No TypeScript errors
- [x] Test harness renders
- [x] Console shows expected logs
- [x] Language detected correctly
- [x] RTL flag computed correctly

### Ideal Success
- [x] All of above
- [x] Button click works
- [x] Toast notification shows
- [x] Signal written to database
- [x] Both EN and AR work
- [x] No console warnings
- [x] No React errors

---

## 📞 Troubleshooting During Phase 1

### If Build Fails
1. **Stop immediately**
2. Check error message carefully
3. Verify file copied correctly (check syntax)
4. Verify import paths match your directory structure
5. If still stuck: Rollback (`git checkout src/`)

### If Test Harness Won't Render
1. Check browser console for errors
2. Check React DevTools for component tree
3. Verify all imports resolve
4. Verify useToast hook exists
5. If still stuck: Create simplified version without toast

### If Language Not Detected
1. Check `useLocale()` is available
2. Verify language context is set up
3. If not using next-intl: Replace with your method
4. Check browser console for useLocale errors

### If RTL Not Applying
1. Verify `is_rtl` computed correctly (check console)
2. Verify `dir` attribute on element (`dir="rtl"`)
3. Verify Tailwind has `flex-row-reverse` class
4. Check browser DevTools: Inspect element, check computed styles

---

## ✨ Ready?

When you've verified everything above, you're ready for Phase 1.

**Next:** Follow `PHASE_1_DEPLOYMENT.md` exactly as written.

---
