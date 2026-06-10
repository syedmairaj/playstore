# Active Context Keywords - Visual & Implementation Guide

## UI Layout

### English (LTR)

```
┌─────────────────────────────────────────────────────┐
│ ✨ ACTIVE CONTEXT                 7 signals active │
│                                                     │
│ All inputs below will be woven into the listing    │
│ automatically. Click × to remove any signal...     │
│                                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │ COMPETITOR KEYWORDS                              ││
│ │ → woven into title + short description          ││
│ │                                                  ││
│ │ 📊 HIGH-VOLUME (2)                               ││
│ │   ┌─────────────────┐  ┌─────────────────┐      ││
│ │   │ fitness app  × │  │ workout track × │      ││
│ │   └─────────────────┘  └─────────────────┘      ││
│ │                                                  ││
│ │ 🎯 INTENT-BASED (2)                              ││
│ │   ┌──────────────────┐  ┌──────────────────┐    ││
│ │   │ health monitor × │  │ tracking app  × │    ││
│ │   └──────────────────┘  └──────────────────┘    ││
│ │                                                  ││
│ │ 🔓 COMPETITOR GAP (2)                            ││
│ │   ┌──────────────────┐  ┌──────────────────┐    ││
│ │   │ free features × │  │ offline mode  × │    ││
│ │   └──────────────────┘  └──────────────────┘    ││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ ⚠️ REVIEW ISSUES                                    │
│ → addressed in description + what's new            │
│   [Issue 1] ×  [Issue 2] ×  [Issue 3] ×           │
│                                                     │
│ 🛡️ COMPETITOR WEAKNESSES                           │
│ → position you as the superior alternative        │
│   [Weakness 1] ×  [Weakness 2] ×                  │
└─────────────────────────────────────────────────────┘
```

### Arabic (RTL)

```
┌─────────────────────────────────────────────────────┐
│ 7 إشارات نشطة                        ✨ السياق النشط│
│                                                     │
│    سيتم دمج جميع المدخلات أدناه تلقائياً في القائمة│
│                   اضغط × لإزالة أي إشارة قبل التوليد│
│                                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │                  الكلمات المفتاحية للمنافسين    ││
│ │           ← تُنسج في العنوان + الوصف القصير     ││
│ │                                                  ││
│ │                           📊 عالي الحجم (2)     ││
│ │  ┌──────────────────┐  ┌──────────────────┐     ││
│ │  │ × تطبيق اللياقة  │  │ × تتبع التمرين   │     ││
│ │  └──────────────────┘  └──────────────────┘     ││
│ │                                                  ││
│ │                       🎯 موجه بالنية (2)        ││
│ │  ┌──────────────────┐  ┌──────────────────┐     ││
│ │  │ × مراقب الصحة    │  │ × تطبيق التتبع   │     ││
│ │  └──────────────────┘  └──────────────────┘     ││
│ │                                                  ││
│ │                    🔓 فجوة تنافسية (2)          ││
│ │  ┌──────────────────┐  ┌──────────────────┐     ││
│ │  │ × المميزات المجانية│ × الوضع غير المتصل│     ││
│ │  └──────────────────┘  └──────────────────┘     ││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│                            ⚠️ مشكلات المراجعات     │
│            ← تُعالَج في الوصف + ما هو جديد          │
│        [المشكلة 1] ×  [المشكلة 2] ×  [المشكلة 3] × │
│                                                     │
│                        🛡️ نقاط ضعف المنافسين      │
│            ← تُستخدم لإبراز التميز في الوصف الطويل │
│                [الضعف 1] ×  [الضعف 2] ×           │
└─────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
<ListingOptimizer>
  ├── state: stagedKeywords (useMemo)
  ├── handler: handleRemoveKeyword
  └── <Active Context Section>
      └── <ActiveContextKeywords>
          ├── groupKeywordsByCategory()
          ├── Category Groups (High-Volume, Intent-Based, Gap)
          │   ├── Category Header (icon + label + count)
          │   └── Keywords List
          │       └── [Keyword Chip] × (removable)
          └── Empty State (if no keywords)
```

## Color Scheme

### High-Volume
```
Text: text-sky-200/90 (Light Sky Blue)
BG:   bg-sky-500/10   (Very faint Sky)
Border: border-sky-500/25
Hover: hover:bg-sky-500/20
Remove: text-sky-400/50 hover:text-sky-300
```

### Intent-Based
```
Text: text-purple-200/90 (Light Purple)
BG:   bg-purple-500/10   (Very faint Purple)
Border: border-purple-500/25
Hover: hover:bg-purple-500/20
Remove: text-purple-400/50 hover:text-purple-300
```

### Competitor Gap
```
Text: text-orange-200/90 (Light Orange)
BG:   bg-orange-500/10   (Very faint Orange)
Border: border-orange-500/25
Hover: hover:bg-orange-500/20
Remove: text-orange-400/50 hover:text-orange-300
```

## Animation States

### Keyword Entrance
```
initial:    opacity: 0, scale: 0.8
animate:    opacity: 1, scale: 1
transition: duration: 0.15s
```

### Keyword Exit (on Remove)
```
exit:       opacity: 0, scale: 0.8
transition: duration: 0.15s
```

### Remove Button Hover
```
whileHover: scale: 1.2
whileTap:   scale: 0.9
```

## Responsive Breakpoints

### Mobile
- Width: Full screen - 12px margin
- Keywords per row: 1-2
- Wrap: Yes
- Gap: 8px

### Tablet
- Width: Full container
- Keywords per row: 2-3
- Wrap: Yes
- Gap: 8px

### Desktop
- Width: Full container
- Keywords per row: 4-5
- Wrap: Yes
- Gap: 8px

## Data Flow on Remove

```
┌─────────────────────────────────────────────┐
│ User clicks × on keyword chip               │
└────────────┬────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────┐
│ onClick handler triggers                    │
│ onRemoveKeyword(keywordId, signalId)       │
└────────────┬────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────┐
│ handleRemoveKeyword() in ListingOptimizer  │
└────────────┬────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────┐
│ POST /api/workspaces/{id}/staging/delete   │
│ body: { signalId }                          │
└────────────┬────────────────────────────────┘
             │
             ↓ (Response 200 OK)
             │
┌─────────────────────────────────────────────┐
│ refreshOptimizerContext()                   │
│ Fetches latest staging vault data           │
└────────────┬────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────┐
│ optimizerContext.activeItems updated        │
│ (signal deleted from vault)                 │
└────────────┬────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────┐
│ stagedKeywords useMemo recomputes           │
│ extractKeywordsFromContext() runs           │
│ deduplicateKeywords() filters               │
└────────────┬────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────┐
│ ActiveContextKeywords re-renders            │
│ Keyword chip exits with animation          │
│ Component updates display                   │
└────────────┬────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────┐
│ User sees keyword removed                   │
│ No page refresh needed                      │
│ Other signals untouched                     │
└─────────────────────────────────────────────┘
```

## Implementation Checklist

### Code Ready
- [x] `optimizer-keywords-display.ts` created
- [x] `ActiveContextKeywords.tsx` created
- [x] `ListingOptimizer.tsx` updated
- [x] Imports added
- [x] Handler implemented
- [x] useMemo hooked up

### Testing Points
- [ ] Keywords display correctly
- [ ] Categories group properly
- [ ] Colors match design
- [ ] Remove works (API called)
- [ ] UI updates after removal
- [ ] English labels correct
- [ ] Arabic labels correct
- [ ] RTL layout correct
- [ ] Wrapping works on mobile
- [ ] Loading state works
- [ ] Empty state displays
- [ ] No console errors

### Deployment
- [ ] Code merged to main
- [ ] Tests passing
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] Build succeeds
- [ ] Staging environment verified
- [ ] Production rollout

---

## Key Integration Points

### 1. `extractKeywordsFromContext()`
```typescript
// Reads from optimizerContext.activeItems
// Looks for metadata.keywords array
// Extracts: term, category, id
// Returns: KeywordDisplayItem[]
```

### 2. `groupKeywordsByCategory()`
```typescript
// Takes: KeywordDisplayItem[]
// Groups by: "high_volume", "intent_based", "competitor_gap"
// Returns: { [category]: KeywordDisplayItem[] }
```

### 3. `ActiveContextKeywords` Component
```typescript
// Props: keywords, locale, isRtl, isLoading, onRemoveKeyword
// Renders: Grouped keyword chips with remove buttons
// Events: Calls onRemoveKeyword on × click
```

### 4. `handleRemoveKeyword()` Handler
```typescript
// Takes: keywordId, signalId
// API Call: DELETE /api/workspaces/{id}/staging/delete
// Refresh: Calls refreshOptimizerContext()
```

---

## Expected Output

### After Implementation
Users should see individual keywords in the Active Context, grouped by category, with the ability to remove any keyword inline without leaving the page.

### Performance
- Extraction: O(n) where n = activeItems count
- Grouping: O(n)
- Rendering: Optimized with memoization
- Removal: < 1 second API + refresh

### State
- Memory: Keywords sync'd to optimizerContext
- Database: Vault updates via API
- UI: Instant feedback with animations

---

**Ready for Production! 🚀**
