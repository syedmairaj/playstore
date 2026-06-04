# How to Find & Edit These Files — Editor Navigation Guide

**Status:** Visual walkthrough for finding changes in your code editor  
**Date:** June 4, 2026

---

## Using VS Code (Recommended)

### Method 1: Using Find & Go to File

#### File 1: IssueCard.tsx

**Step 1: Open File**
```
Press: Ctrl+P (or Cmd+P on Mac)
Type: IssueCard.tsx
Select: components/reviews/IssueCard.tsx
```

**Step 2: Go to Line 131 (handleClick function)**
```
Press: Ctrl+G (or Cmd+G on Mac)
Type: 131
Hit: Enter
```

You should see:
```typescript
131 | export function IssueCard({ issue, workspaceId, appId, added, onAdd }: IssueCardProps) {
132 |   const router = useRouter();
133 |   const config = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.MEDIUM;
134 |   const impactPct = Math.round(issue.impact * 100);
135 |
136 |   // ❌ DELETE FROM HERE (lines 137-140):
137 |   const [status, setStatus] = React.useState<PipelineStatus>(
138 |     added ? "STAGED" : "AVAILABLE",
139 |   );
140 |   const [busy, setBusy] = React.useState(false);
141 |
142 |   const cta = CTA_CONFIG[status];
143 |
144 |   async function handleClick() {
...
163 |   }
```

**Step 3: Go to Line 216 (button section)**
```
Press: Ctrl+G (or Cmd+G on Mac)
Type: 216
Hit: Enter
```

You should see:
```typescript
216 |       {/* ── Pipeline CTA ── */}
217 |       <TooltipProvider delayDuration={400}>
218 |         <TooltipRoot>
219 |           <TooltipTrigger asChild>
220 |             <span
...
263 |           </TooltipRoot>
264 |         </TooltipProvider>
```

**What to do:**
1. Select from line 137-140 (state variables) → Delete
2. Select from line 144-163 (handleClick function) → Delete
3. Select from line 216-264 (TooltipProvider section) → Delete
4. Go to line 1 and add import (before existing imports):
   ```typescript
   import { StageButton } from "@/components/staging/StageButton";
   ```
5. Where button was (around line 216), add StageButton code

---

#### File 2: MarketIntelligenceClient.tsx

**Step 1: Open File**
```
Press: Ctrl+P (or Cmd+P on Mac)
Type: MarketIntelligenceClient.tsx
Select: components/market/MarketIntelligenceClient.tsx
```

**Step 2: Go to Line 142 (OptimizeWithSpotlightButton function)**
```
Press: Ctrl+G (or Cmd+G on Mac)
Type: 142
Hit: Enter
```

You should see:
```typescript
142 | function OptimizeWithSpotlightButton({
143 |   spotlight,
144 |   workspaceId,
145 |   isRtl,
146 | }: {
147 |   spotlight: KeywordSpotlightResult;
148 |   workspaceId: string;
149 |   isRtl: boolean;
150 | }) {
151 |   const router = useRouter();
...
207 | }
```

**What to do:**
1. Select lines 142-207 (entire function)
2. Delete
3. Add new function (from guide)
4. Find where it's called (use Ctrl+F to find "OptimizeWithSpotlightButton")
5. Update the call to include `ownAppId` prop

---

#### File 3: CompetitorSpySnapshotCard.tsx

**Step 1: Open File**
```
Press: Ctrl+P (or Cmd+P on Mac)
Type: competitor-spy-snapshot-card.tsx
Select: components/competitor-spy/competitor-spy-snapshot-card.tsx
```

**Step 2: Go to Line 43 (Props type)**
```
Press: Ctrl+G (or Cmd+G on Mac)
Type: 43
Hit: Enter
```

You should see:
```typescript
43 | export type CompetitorSpySnapshotCardProps = {
44 |   isRtl: boolean;
45 |   workspaceAppName: string;
...
57 | };
```

**What to add (after line 49):**
```typescript
  workspaceId: string;  // ← ADD
  appId?: string;       // ← ADD
```

**Step 3: Go to Line 59 (Component function)**
```
Press: Ctrl+G (or Cmd+G on Mac)
Type: 59
Hit: Enter
```

Update destructuring to include:
```typescript
  workspaceId,  // ← ADD
  appId,        // ← ADD
```

**Step 4: Go to Line 199 (Button section)**
```
Press: Ctrl+G (or Cmd+G on Mac)
Type: 199
Hit: Enter
```

You should see:
```typescript
199 |               <TooltipProvider>
200 |                 <Tooltip
...
217 |                 </TooltipProvider>
```

**What to do:**
1. Select lines 199-217 (TooltipProvider section)
2. Delete
3. Add StageButton code

---

### Method 2: Using Find & Replace

#### Quick Find for Line Numbers

**In VS Code:**
```
Press: Ctrl+H (or Cmd+H on Mac)  ← Opens Find & Replace
Type search term: e.g., "handleClick" or "OptimizeWithSpotlight"
View matches and navigate
```

#### Find the Button to Replace

**For IssueCard.tsx:**
```
Search for: "Pipeline CTA"
This shows you line 216 where button starts
```

**For MarketIntelligenceClient.tsx:**
```
Search for: "Optimize with Market Spotlight"
Or: "OptimizeWithSpotlightButton"
```

**For CompetitorSpySnapshotCard.tsx:**
```
Search for: "sendOptimizer"
This shows you the button location
```

---

## Visual Timeline of Changes

### Step 1: Location Map (What you'll see)

```
BEFORE (❌ Current Code):
┌─────────────────────────────────────────┐
│ reviews/IssueCard.tsx                   │
│ ├─ Line 131: export function IssueCard  │
│ ├─ Line 137-140: const [status] = ...  │ ← DELETE
│ ├─ Line 144-163: async function...     │ ← DELETE
│ ├─ Line 216-264: <TooltipProvider>     │ ← DELETE & REPLACE
│ └─ Line 264: </CardContent>            │
└─────────────────────────────────────────┘

AFTER (✅ New Code):
┌─────────────────────────────────────────┐
│ reviews/IssueCard.tsx                   │
│ ├─ Line 1: import { StageButton }  ✓   │ ← ADD
│ ├─ Line 131: export function IssueCard  │
│ ├─ (no state variables)                 │
│ ├─ (no handleClick)                     │
│ ├─ Line 216: <StageButton ... />    ✓  │ ← ADD
│ └─ Line 230: </CardContent>            │
└─────────────────────────────────────────┘
```

---

## Opening in Your Editor Right Now

### VSCode Quick Open

```
1. Open VS Code
2. Press Ctrl+K Ctrl+O (or Cmd+K Cmd+O on Mac)
3. Navigate to: /Users/syedmairaj/Documents/playstore
4. Open the three files in tabs:
   - components/reviews/IssueCard.tsx
   - components/market/MarketIntelligenceClient.tsx
   - components/competitor-spy/competitor-spy-snapshot-card.tsx
```

### Using Terminal

```bash
# Open in VS Code from terminal
code /Users/syedmairaj/Documents/playstore/components/reviews/IssueCard.tsx
code /Users/syedmairaj/Documents/playstore/components/market/MarketIntelligenceClient.tsx
code /Users/syedmairaj/Documents/playstore/components/competitor-spy/competitor-spy-snapshot-card.tsx
```

---

## Search Strings for Each Change

### IssueCard.tsx — What to Search For

```
Search 1: "const [status, setStatus]"
Result: Line 137 (DELETE this and next 3 lines)

Search 2: "async function handleClick"
Result: Line 144 (DELETE entire function until line 163)

Search 3: "Pipeline CTA"
Result: Line 216 (DELETE entire TooltipProvider section)
```

### MarketIntelligenceClient.tsx — What to Search For

```
Search 1: "function OptimizeWithSpotlightButton"
Result: Line 142 (DELETE entire function until line 207)

Search 2: "<OptimizeWithSpotlightButton"
Result: Where it's called (ADD ownAppId prop)
```

### CompetitorSpySnapshotCard.tsx — What to Search For

```
Search 1: "onSendToOptimizer: () => void"
Result: Line 54 (ADD workspaceId and appId props instead)

Search 2: "sendOptimizer"
Result: Line 213 (Location of button, DELETE TooltipProvider)

Search 3: "onSendToOptimizer={" 
Result: Where component is called (REMOVE this, ADD workspaceId, appId)
```

---

## Before Starting: Checklist

```
☐ Backup your code (git commit or file copy)
☐ Open all 3 files in VS Code tabs
☐ Verify StageButton.tsx exists in components/staging/
☐ Verify Toast.tsx exists in components/
☐ Verify useToast.ts exists in hooks/
☐ Check root layout has <ToastContainer />
```

---

## During Implementation: Progress Tracking

### File 1: IssueCard.tsx
```
Progress:
☐ 0% - File open
☐ 25% - State variables deleted
☐ 50% - handleClick function deleted
☐ 75% - Old button code deleted
☐ 90% - New StageButton added
☐ 95% - Imports cleaned up
☐ 100% - Saved
```

### File 2: MarketIntelligenceClient.tsx
```
Progress:
☐ 0% - File open
☐ 50% - OptimizeWithSpotlightButton replaced
☐ 75% - Caller updated with ownAppId prop
☐ 90% - Imports cleaned up
☐ 100% - Saved
```

### File 3: CompetitorSpySnapshotCard.tsx
```
Progress:
☐ 0% - File open
☐ 25% - Props type updated
☐ 50% - Function signature updated
☐ 75% - Button section replaced
☐ 90% - Caller updated with new props
☐ 100% - Saved
```

---

## Testing After Changes

### Quick Test (2 minutes)
```
1. Save all 3 files
2. npm run dev (or yarn dev)
3. Go to http://localhost:3000/reviews
4. Look for StageButton (should be on issue cards)
5. Click one
6. Toast should appear
7. Check that page doesn't navigate
```

### Full Test (10 minutes)
```
1. Reviews page → Click StageButton → Toast ✓
2. Market Intelligence → Click StageButton → Toast ✓
3. Competitor Spy → Click StageButton → Toast ✓
4. Go to Optimizer page → See vault signals ✓
5. Test with Arabic locale if available ✓
```

---

## If Something Goes Wrong

### Compilation Errors

**Error: "Cannot find module '@/components/staging/StageButton'"**
→ Check file path: `components/staging/StageButton.tsx` exists

**Error: "React is not defined"**
→ Add import: `import React from "react";`

**Error: Property 'xxx' is missing"**
→ Check StageButton props match the component

### Runtime Errors

**Toast doesn't appear**
→ Check root layout has `<ToastContainer />`

**Button doesn't show**
→ Check import path: `@/components/staging/StageButton`

**Page navigates away**
→ Old code still there, check you deleted the entire button section

### Fix by Reverting

```bash
# If you made mistakes, revert and start over
git checkout components/reviews/IssueCard.tsx
git checkout components/market/MarketIntelligenceClient.tsx
git checkout components/competitor-spy/competitor-spy-snapshot-card.tsx

# Then try again following the guide
```

---

## Line-by-Line Change Reference

### IssueCard.tsx Changes Summary
```
DELETE:  Lines 137-140   (const [status] variables)
DELETE:  Lines 144-163   (handleClick function)
DELETE:  Lines 216-264   (TooltipProvider button section)
ADD:     Line 1          (import { StageButton })
ADD:     Line ~216       (<StageButton /> component)
DELETE:  Top imports     (ArrowRight, CheckCircle2, PlusCircle, Tooltip*)
DELETE:  Lines 64-106    (CTA_CONFIG const)
DELETE:  Lines 19+       (type PipelineStatus, type CtaConfig)
```

### MarketIntelligenceClient.tsx Changes Summary
```
DELETE:  Lines 142-207  (OptimizeWithSpotlightButton function)
ADD:     Line ~142      (New OptimizeWithSpotlightButton function)
ADD:     Prop to caller (ownAppId={ownAppId})
ADD:     Line 1         (import { StageButton })
DELETE:  Top imports    (ArrowRight, Wand2, useRouter)
```

### CompetitorSpySnapshotCard.tsx Changes Summary
```
ADD:     Props type     (workspaceId: string, appId?: string)
DELETE:  Prop type      (onSendToOptimizer: () => void)
UPDATE:  Function sig   (Add workspaceId, appId to destructuring)
DELETE:  Lines 199-217  (TooltipProvider button section)
ADD:     Line ~199      (<StageButton /> component)
ADD:     Line 1         (import { StageButton })
DELETE:  Top imports    (Sparkles, TooltipProvider, Tooltip)
UPDATE:  Component call (Add workspaceId, appId props; remove onSendToOptimizer)
```

---

**Status:** ✅ You can now find & edit the files

Take the file paths and line numbers and start with IssueCard.tsx (simplest).

All the changes are clearly marked with ❌ (delete) and ✅ (add) in the IMPLEMENTATION_VISUAL_GUIDE.md
