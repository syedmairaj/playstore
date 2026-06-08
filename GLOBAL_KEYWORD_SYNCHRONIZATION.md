# Global Keyword Synchronization: Term-Based Selection

**Status:** ✅ IMPLEMENTED  
**Problem:** Identical keywords appearing in different categories not synced  
**Solution:** Term-based selection state (not composite key)

---

## Problem Statement

### The Issue
```
Data:
┌─ HIGH-VOLUME
│  ├─ myfitnesspal
│  ├─ health
│  └─ fitness
│
├─ INTENT-BASED
│  ├─ myfitnesspal  ← SAME TERM!
│  ├─ monitor
│  └─ app
│
└─ COMPETITOR-GAP
   ├─ myfitnesspal  ← SAME TERM!
   ├─ nutrition
   └─ ...

User Action: Click 'myfitnesspal' in HIGH-VOLUME
Expected: All instances of 'myfitnesspal' show selected
Actual (Old): Only HIGH-VOLUME shows selected ❌
```

### Root Cause
Old implementation used composite key: `${term}|${category}`
- `myfitnesspal|high_volume` ≠ `myfitnesspal|intent_based`
- Treated same keyword as separate selections
- Result: Out-of-sync state across categories

---

## Solution: Term-Based Global State

### New Architecture

```
┌─────────────────────────────────────────────────────┐
│ Normalized State: selectedTerms: Set<string>       │
│                                                     │
│ Set{ "myfitnesspal", "health", "fitness" }         │
│                                                     │
│ - ONLY the term matters for selection              │
│ - Category is ignored in selection logic           │
│ - O(1) lookup: selectedTerms.has("myfitnesspal")   │
│ - Global: affects all categories where term exists │
└─────────────────────────────────────────────────────┘
           ↓ (when exporting)
┌─────────────────────────────────────────────────────┐
│ Final Payload (for staging-vault-service.ts):      │
│                                                     │
│ [                                                   │
│   { term: 'myfitnesspal', category: 'high_volume' },
│   { term: 'myfitnesspal', category: 'intent_based' },
│   { term: 'health', category: 'high_volume' },     │
│   ...                                               │
│ ]                                                   │
│                                                     │
│ - Same term can appear multiple times (different   │
│   categories)                                       │
│ - Still respects schema: { term, category }        │
│ - Database receives all term-category pairs        │
└─────────────────────────────────────────────────────┘
```

---

## Implementation

### Core Hook: `useKeywordSelectionGlobal`

**Location:** `src/hooks/useKeywordSelectionGlobal.ts`

**Key Methods:**

```typescript
// Check if term is selected (works across ALL categories)
isTermSelected(term: string): boolean
// Returns true if 'myfitnesspal' is selected (regardless of category)

// Toggle term (affects all instances)
toggleTerm(term: string): void
// Select/deselect 'myfitnesspal' everywhere it appears

// Export with categories preserved
getSelectedKeywords(allKeywords: Array<{term, category}>): PayloadArray
// Returns: [{ term: 'myfitnesspal', category: 'high_volume' }, ...]
```

---

## UI Implementation Pattern

### Old Pattern (Composite Key)
```typescript
// ❌ OLD: Separate selection per category
const { isKeywordSelected } = useKeywordSelection();

// In pill component:
isSelected={isKeywordSelected('myfitnesspal', 'high_volume')}
// Only shows selected in HIGH-VOLUME, not in other categories
```

### New Pattern (Term-Based)
```typescript
// ✅ NEW: Global term-based selection
const { isTermSelected } = useKeywordSelectionGlobal();

// In pill component:
isSelected={isTermSelected('myfitnesspal')}
// Shows selected in ALL categories where term appears
```

---

## Migration Example

### Before (Composite Key)
```typescript
// Select 'myfitnesspal' in HIGH-VOLUME
selectedIds = Set{
  "myfitnesspal|high_volume"  // Only this entry
}

// Result: Pill in HIGH-VOLUME shows selected ✓
//         Pill in INTENT-BASED shows unselected ❌ (different key!)
//         Pill in COMPETITOR-GAP shows unselected ❌ (different key!)
```

### After (Term-Based)
```typescript
// Select 'myfitnesspal' in HIGH-VOLUME
selectedTerms = Set{
  "myfitnesspal"  // Just the term!
}

// Result: All pills with 'myfitnesspal' term show selected ✓
//         HIGH-VOLUME: selected ✓
//         INTENT-BASED: selected ✓ (SAME term!)
//         COMPETITOR-GAP: selected ✓ (SAME term!)
```

---

## Bilingual Support (EN/AR)

### Category Labels
```typescript
const categoryLabel = locale === 'ar' 
  ? 'عالي الحجم'      // Arabic for High-Volume
  : 'High-Volume';     // English

// When user selects 'myfitnesspal':
// Arabic UI: Shows ✓ next to كلمة في كل الفئات
// English UI: Shows ✓ next to term in all categories
```

### Selection State Labels
```typescript
const selectionLabel = locale === 'ar'
  ? 'تم الاختيار'      // "Selected"
  : 'Selected';

// Same term-based logic works for both languages
// RTL layout automatically mirrors with isRtl flag
```

---

## Component Integration

### In KeywordSurfacesInlineContent

```typescript
const { isTermSelected, toggleTerm } = useKeywordSelectionGlobal();

{groups.map((group) => (
  <div key={group.strategy}>
    {/* Category counts auto-calculated from selectedTerms */}
    <KeywordCategoryHeader
      selectedCount={group.keywords.filter(kw => 
        isTermSelected(kw)  // ← Check term, not category
      ).length}
    />

    {/* Pills show same selection across all categories */}
    <div className="grid grid-cols-2 gap-2">
      {group.keywords.map((keyword) => (
        <KeywordPillMemoized
          keyword={keyword}
          category={group.strategy}
          // ✅ SYNCED: Shows selected if term is selected
          isSelected={isTermSelected(keyword)}
          // ✅ SYNCED: Toggles term globally
          onToggle={(term) => toggleTerm(term)}
        />
      ))}
    </div>
  </div>
))}
```

---

## Validation & Export

### Maintaining Schema Compliance

Despite term-based state, final export preserves `{ term, category }` schema:

```typescript
// User selects 'myfitnesspal' (appears in 2 categories)
selectedTerms = Set{ "myfitnesspal" }

// Get all keywords from component
const allKeywords = [
  { term: 'myfitnesspal', category: 'high_volume' },
  { term: 'myfitnesspal', category: 'intent_based' },
  { term: 'health', category: 'high_volume' },
  // ... more
]

// Export
const payload = getSelectedKeywords(allKeywords);
// Returns:
// [
//   { term: 'myfitnesspal', category: 'high_volume' },
//   { term: 'myfitnesspal', category: 'intent_based' },
// ]
```

This payload passes through `validateKeywordPayload()` unchanged.

---

## Performance Characteristics

### Selection Check (isTermSelected)
```
O(1) - Set.has() lookup
- Selecting 'myfitnesspal' in HIGH-VOLUME
- Check if 'myfitnesspal' is in Set: instant
- All 3 category pills show selected simultaneously
```

### Export (getSelectedKeywords)
```
O(n) where n = total keywords
- Iterate all keywords
- Filter by selectedTerms Set membership
- Include category information
```

### Memoization
```
countByCategory re-calculated only when:
- selectedTerms changes
- NOT when you navigate between categories
- NOT when you switch languages
```

---

## Testing Checklist

### Functional Tests
- [ ] Select 'myfitnesspal' in HIGH-VOLUME
  - [ ] Shows selected in HIGH-VOLUME
  - [ ] Shows selected in INTENT-BASED (same term)
  - [ ] Shows selected in COMPETITOR-GAP (same term)
  - [ ] Category counts update automatically

- [ ] Toggle 'myfitnesspal' in INTENT-BASED to deselect
  - [ ] All instances show unselected
  - [ ] Count drops by 1

- [ ] Select All in HIGH-VOLUME
  - [ ] All HIGH-VOLUME keywords selected
  - [ ] If 'myfitnesspal' also in INTENT-BASED, shows selected there too
  - [ ] Count is correct (unique terms, not instances)

### Multilingual Tests
- [ ] Switch to Arabic, select keyword
  - [ ] Term appears selected across all categories
  - [ ] Category labels show in Arabic
  - [ ] RTL layout mirrors correctly

- [ ] Select in English, switch to Arabic
  - [ ] Selection persists (same term!)
  - [ ] UI updates for Arabic correctly

### Schema Validation
- [ ] Export payload has correct format: `{ term, category }[]`
- [ ] Same term can appear multiple times (different categories)
- [ ] Passes `validateKeywordPayload()` gatekeeper
- [ ] Database receives all term-category pairs correctly

---

## Before vs After

### Before (Composite Key Problem)
```
User: Click 'myfitnesspal' in HIGH-VOLUME
System: selectedIds = Set{ "myfitnesspal|high_volume" }

UI Result:
HIGH-VOLUME: myfitnesspal ✓ (selected)
INTENT-BASED: myfitnesspal ⭕ (unselected)  ❌ WRONG!
COMPETITOR-GAP: myfitnesspal ⭕ (unselected) ❌ WRONG!

User: "Why isn't myfitnesspal selected in other categories?"
```

### After (Term-Based Solution)
```
User: Click 'myfitnesspal' in HIGH-VOLUME
System: selectedTerms = Set{ "myfitnesspal" }

UI Result:
HIGH-VOLUME: myfitnesspal ✓ (selected)
INTENT-BASED: myfitnesspal ✓ (selected)  ✅ CORRECT!
COMPETITOR-GAP: myfitnesspal ✓ (selected) ✅ CORRECT!

User: "Perfect! Term is selected everywhere."
```

---

## Conclusion

**Term-based global selection** solves the synchronization problem:

✅ Single source of truth: `selectedTerms` Set  
✅ Global awareness: selecting term affects all categories  
✅ Schema preserved: export still includes category  
✅ Performance: O(1) lookups, memoized derivations  
✅ Bilingual: works seamlessly with EN/AR  
✅ Intuitive UX: users see consistent state  

**Result: Fully synchronized, global keyword selection across all categories.** 🚀
