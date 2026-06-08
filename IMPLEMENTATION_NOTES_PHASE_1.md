# Keyword Curation Engine - Phase 1 Implementation Notes

**Status:** ✅ Phase 1 Complete (useKeywordSelection + KeywordPillCurate)  
**Date:** June 8, 2026  
**Components:** 2/4 (49% complete)

---

## What You Now Have

### 1. **useKeywordSelection.ts** ✅

**Location:** `src/hooks/useKeywordSelection.ts`

**Purpose:** Central state management for all keyword selection operations

**Key Characteristics:**
- Map-based tracking (`Map<term, KeywordCategory>`) for O(1) lookups
- Full TypeScript with strict types
- Multilingual support (EN/AR via locale parameter)
- Comprehensive diagnostic logging with `[StagingVault]` prefix
- Memoized computed values (selectedCount, countByCategory, formattedSummary)
- No external dependencies beyond React

**Exports:**
```typescript
export type KeywordCategory = 'high_volume' | 'intent_based' | 'competitor_gap';
export interface KeywordPayload { term: string; category: KeywordCategory; }
export interface UseKeywordSelectionReturn { ... }
export function useKeywordSelection(locale: string): UseKeywordSelectionReturn;
```

**Core Methods:**
- `toggleKeyword(term, category)` - Select/deselect
- `selectAll(keywords)` - Batch select
- `clearAll()` - Clear all selections
- `getSelectedKeywords()` - Returns payload for DB
- `isSelected(term)` - Check selection state
- `getSelectedByCategory()` - Group for analytics
- `formattedSummary` - Display text ("2 High-Volume • 1 Intent-Based")

### 2. **keyword-pill-curate.tsx** ✅

**Location:** `src/components/competitor-spy/keyword-pill-curate.tsx`

**Purpose:** Individual selectable keyword pill component

**Key Characteristics:**
- Pure component (no internal state except copy feedback)
- Full RTL/LTR support via `isRtl` prop
- Dual-mode: curation (select) or copy (clipboard)
- Animated state transitions (Framer Motion)
- Category-aware coloring (changes on selection)
- Accessibility compliant (ARIA labels, keyboard navigation)
- Memoized with React.forwardRef for performance

**Props:**
```typescript
interface KeywordPillCurateProps {
  keyword: string;                        // e.g., "fitness tracker"
  category: KeywordCategory;              // high_volume | intent_based | competitor_gap
  locale: string;                         // 'en' or 'ar'
  isRtl?: boolean;                       // RTL layout flag
  isSelected?: boolean;                  // Current selection state
  onToggle?: (term, category) => void;   // Called when clicked (curation mode)
  curateMode?: boolean;                  // true=select, false=copy
}
```

**Visual States:**

| State | Icon | Color | Interaction |
|-------|------|-------|-------------|
| Unselected (curation) | Empty circle | Muted | Click to select |
| Selected (curation) | Checkmark circle | Bright + glow | Click to deselect |
| Copy mode | Copy/Check icon | Muted → Check | Click to copy |

---

## Architecture Alignment

### Type System

Your codebase uses:
- `LanguageCode` type for EN/AR from `src/types/staging-contract.ts`
- `KeywordPayload` interface matching DB schema
- `KeywordCategory` union type matching `keywords_by_strategy`

**Alignment:** ✅ These new components use the same type patterns consistently.

### Logging Conventions

Your codebase uses diagnostic logging with prefixes:
- `[StagingVault]` - Staging vault operations (existing)
- `[KeywordPillCurate]` - Keyword pill interactions (new)

**Added Logging Levels:**
- 🔍 Info/tracking
- ✓ Success/pass
- ❌ Error/fail
- 🔄 State changes

### Multilingual Support

Your codebase:
- Uses `useLocale()` from next-intl
- Derives RTL flag: `locale === 'ar'`
- Passes `dir` attribute to containers
- Uses className: `isRtl && 'flex-row-reverse'`

**Alignment:** ✅ Both components follow this exact pattern.

### Component Patterns

Your codebase uses:
- Client components via `'use client'` directive
- Callback-based state passing (vs Redux/Context)
- Framer Motion for animations
- Tailwind CSS for styling
- shadcn/ui components when available

**Alignment:** ✅ Both components follow these patterns exactly.

---

## Data Flow (Current Phase)

```
┌─────────────────────────────────────────────────────────────┐
│ USER INTERACTION                                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  [KeywordPillCurate] User clicks keyword                    │
│         ↓                                                     │
│  onToggle(term, category) called                            │
│         ↓                                                     │
│  [useKeywordSelection] toggleKeyword() invoked              │
│         ↓                                                     │
│  selectedMap updated (new Map instance)                     │
│         ↓                                                     │
│  React triggers re-render                                    │
│         ↓                                                     │
│  [KeywordPillCurate] isSelected prop changes                │
│         ↓                                                     │
│  Visual state updates (icon, color, glow)                   │
│         ↓                                                     │
│  Floating Bar sees selectedCount > 0                        │
│         ↓                                                     │
│  Floating Bar becomes visible (next phase)                  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Validation Integration (Deferred to Phase 2)

**CRITICAL:** The validation gatekeeper is NOT called in Phase 1.

- `validateKeywordPayload()` exists in `staging-vault-service.ts`
- It will be called in Phase 2 (floating bar component)
- When `useKeywordSelection.getSelectedKeywords()` returns payload
- Before `addSignalToVault()` sends to DB

**This Design:**
1. ✅ Allows selection UI to work independently
2. ✅ Separates concerns (selection vs validation vs storage)
3. ✅ Matches your existing architecture pattern
4. ✅ Defers validation error handling to Phase 2

---

## Testing Guidelines for Phase 1

### Unit Tests (useKeywordSelection)

```typescript
describe('useKeywordSelection', () => {
  it('should toggle keyword selection', () => {
    const { result } = renderHook(() => useKeywordSelection('en'));
    
    expect(result.current.selectedCount).toBe(0);
    
    act(() => {
      result.current.toggleKeyword('fitness', 'high_volume');
    });
    
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.isSelected('fitness')).toBe(true);
    expect(result.current.getCategoryForKeyword('fitness')).toBe('high_volume');
  });

  it('should generate correct payload', () => {
    const { result } = renderHook(() => useKeywordSelection('en'));
    
    act(() => {
      result.current.toggleKeyword('fitness', 'high_volume');
      result.current.toggleKeyword('workout', 'intent_based');
    });
    
    const payload = result.current.getSelectedKeywords();
    expect(payload).toHaveLength(2);
    expect(payload).toContainEqual({ term: 'fitness', category: 'high_volume' });
    expect(payload).toContainEqual({ term: 'workout', category: 'intent_based' });
  });

  it('should format summary in English', () => {
    const { result } = renderHook(() => useKeywordSelection('en'));
    
    act(() => {
      result.current.toggleKeyword('fitness', 'high_volume');
      result.current.toggleKeyword('workout', 'high_volume');
      result.current.toggleKeyword('diet', 'intent_based');
    });
    
    expect(result.current.formattedSummary).toBe('2 High-Volume • 1 Intent-Based');
  });

  it('should format summary in Arabic', () => {
    const { result } = renderHook(() => useKeywordSelection('ar'));
    
    act(() => {
      result.current.toggleKeyword('fitness', 'high_volume');
      result.current.toggleKeyword('diet', 'intent_based');
    });
    
    expect(result.current.formattedSummary).toBe('1 عالي الحجم • 1 موجه بالنية');
  });
});
```

### Component Tests (KeywordPillCurate)

```typescript
describe('KeywordPillCurate', () => {
  it('should render keyword text', () => {
    render(
      <KeywordPillCurate
        keyword="fitness tracker"
        category="high_volume"
        locale="en"
        isRtl={false}
        isSelected={false}
        curateMode={true}
      />
    );
    
    expect(screen.getByText('fitness tracker')).toBeInTheDocument();
  });

  it('should show checkmark when selected', () => {
    const { container } = render(
      <KeywordPillCurate
        keyword="fitness"
        category="high_volume"
        locale="en"
        isRtl={false}
        isSelected={true}
        curateMode={true}
      />
    );
    
    expect(container.querySelector('svg')).toHaveClass('lucide-check-circle-2');
  });

  it('should call onToggle when clicked in curation mode', () => {
    const onToggle = jest.fn();
    render(
      <KeywordPillCurate
        keyword="fitness"
        category="high_volume"
        locale="en"
        isRtl={false}
        isSelected={false}
        onToggle={onToggle}
        curateMode={true}
      />
    );
    
    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledWith('fitness', 'high_volume');
  });

  it('should support RTL layout', () => {
    const { container } = render(
      <KeywordPillCurate
        keyword="تطبيق لياقة"
        category="high_volume"
        locale="ar"
        isRtl={true}
        isSelected={false}
        curateMode={true}
      />
    );
    
    expect(container.querySelector('button')).toHaveAttribute('dir', 'rtl');
  });
});
```

### Manual Testing (Browser)

1. **Component Isolation:**
   ```tsx
   // In a test file or Storybook
   import { useKeywordSelection } from '@/hooks/useKeywordSelection';
   import { KeywordPillCurate } from '@/components/competitor-spy/keyword-pill-curate';
   
   export function KeywordPillTest() {
     const selection = useKeywordSelection('en');
     
     return (
       <div className="space-y-4 p-8">
         <div className="space-y-2">
           {['fitness', 'workout', 'trainer'].map(kw => (
             <KeywordPillCurate
               key={kw}
               keyword={kw}
               category="high_volume"
               locale="en"
               isRtl={false}
               isSelected={selection.isSelected(kw)}
               onToggle={selection.toggleKeyword}
               curateMode={true}
             />
           ))}
         </div>
         <p>Selected: {selection.selectedCount}</p>
         <p>{selection.formattedSummary}</p>
       </div>
     );
   }
   ```

2. **Selection Verification:**
   - Click keywords, verify checkmark appears ✓
   - Verify color changes to bright ✓
   - Verify selectedCount increments ✓
   - Verify formattedSummary updates ✓
   - Click again to deselect, verify state resets ✓

3. **RTL Testing:**
   - Change locale to 'ar'
   - Verify Arabic text rendered correctly ✓
   - Verify layout mirrors (flex-row-reverse) ✓
   - Verify category labels in Arabic ✓

4. **Copy Mode Testing:**
   - Set `curateMode={false}`
   - Click keyword, verify copies to clipboard ✓
   - Verify copy icon animates to checkmark ✓
   - Paste to verify content ✓

---

## Next Phase (Phase 2/3)

**Not yet implemented:**
1. ❌ `keyword-curation-floating-bar.tsx` - Action bar with Send button
2. ❌ `keyword-surfaces-curation.tsx` - Parent container integrating all pieces
3. ❌ Integration with `staging-vault-service.ts`
4. ❌ Backend signal staging

**These will depend on Phase 1 being rock-solid**, so focus on:
- Testing Phase 1 components thoroughly
- Verifying state management works as expected
- Confirming RTL/LTR layout correct
- Checking console logs for expected diagnostic output

---

## Known Limitations (Phase 1)

| Limitation | Reason | Will Fix In |
|-----------|--------|------------|
| No floating bar | Not yet built | Phase 2 |
| No "Send" button | Not yet built | Phase 2 |
| Keywords don't persist | No backend call | Phase 2 |
| No validation errors shown | Validation deferred | Phase 2 |
| No copy mode integration | Will add copy option later | Phase 2-3 |

---

## Files Modified/Created

| File | Status | Changes |
|------|--------|---------|
| `src/hooks/useKeywordSelection.ts` | ✅ Created | 300+ lines, full documentation |
| `src/components/competitor-spy/keyword-pill-curate.tsx` | ✅ Created | 400+ lines, full documentation |
| No other files modified in Phase 1 | ✅ | Zero disruption to existing code |

---

## Debugging Commands

```typescript
// In browser console, after opening any component using these:

// Check if hook works
const { result } = renderHook(() => useKeywordSelection('en'));
result.current.toggleKeyword('fitness', 'high_volume');
console.log(result.current.getSelectedKeywords());
// Expected: [{ term: 'fitness', category: 'high_volume' }]

// Check RTL logic
console.log('isRtl:', 'ar' === 'ar');
console.log('dir attribute:', document.querySelector('[dir="rtl"]'));

// Verify Framer Motion loaded
console.log('motion:', typeof motion !== 'undefined');

// Verify Lucide icons loaded
console.log('CheckCircle2:', CheckCircle2);
```

---

## Code Quality Checklist

- ✅ Full TypeScript coverage (no `any` types)
- ✅ Comprehensive JSDoc comments with examples
- ✅ Consistent naming conventions (camelCase, SCREAMING_SNAKE_CASE for constants)
- ✅ Error handling with try/catch
- ✅ Proper logging with diagnostic prefixes
- ✅ RTL/LTR support (no hardcoded direction)
- ✅ Accessibility (ARIA labels, keyboard support)
- ✅ Performance optimizations (memoization, useCallback)
- ✅ No external API calls (deferred to Phase 2)
- ✅ No state mutations (immutable Map pattern)

---

## Integration Readiness

**Phase 1 is ready for:**
- ✅ Unit testing
- ✅ Visual/manual testing
- ✅ Integration into larger components
- ✅ Code review

**Phase 1 is NOT ready for:**
- ❌ Production deployment (missing Phases 2-3)
- ❌ Backend integration (no API calls)
- ❌ User-facing features (incomplete UI)

---

**Next Step:** Implement Phase 2 (floating bar component) once Phase 1 is tested and approved.

**Questions?** Refer to the extensive inline documentation in both files.
