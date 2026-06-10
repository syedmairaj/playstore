# Staging Flow - Quick Start Guide

## What Changed?

**Before:** "Send to AI Optimizer" → Forced navigation to optimizer page  
**After:** "Send to AI Optimizer" → Stages keywords in vault → Stays in Competitor Spy

## For Users

### English Flow
1. Select keywords in Competitor Spy
2. Click green "Send to AI Optimizer" button
3. ✅ Toast: "Keywords staged for AI Listing Optimizer"
4. Choose:
   - "Go to Optimizer" (navigate to review)
   - "Continue Later" (stay and add more signals)

### Arabic Flow
1. اختر الكلمات في Competitor Spy
2. انقر على الزر الأخضر "إرسال للمحسِّن"
3. ✅ إشعار: "تم إرسال الكلمات إلى محسِّن القائمة بنجاح"
4. اختر:
   - "انتقل إلى المحسِّن" (الانتقال للمراجعة)
   - "المتابعة لاحقاً" (البقاء وإضافة المزيد)

## For Developers

### Files to Know

1. **`src/lib/client/competitor-spy-staging-flow.ts`** ← Core logic
2. **`src/components/competitor-spy/keyword-curation-floating-bar.tsx`** ← UI component

### Import & Use

```typescript
import { stageKeywordsNoNavigation } from "@/lib/client/competitor-spy-staging-flow";

const result = await stageKeywordsNoNavigation(
  supabase,
  workspaceId,
  selectedKeywords,
  "Competitor Name",
  competitorId,
  appId,
  locale // "en" or "ar"
);

if (result.success) {
  toast.success(result.message);
}
```

### Component Props

```typescript
<KeywordCurationFloatingBar
  workspaceId="ws-123"
  competitorId="comp-456"
  competitorName="Apple"
  appId="app-789"
  selectedKeywords={[...]}
  selectedCount={5}
  countByCategory={{...}}
  formattedSummary="3 High-Volume • 2 Intent-Based"
  onClear={handleClear}
  onSuccess={(signalId) => {...}}
  onStagingComplete={(signalId, count) => {...}}
/>
```

## Features

✅ No forced navigation  
✅ Success toast with actions  
✅ Bilingual (EN/AR)  
✅ RTL support  
✅ Type-safe TypeScript  
✅ Vault integration  
✅ Error handling  

## Key Methods

### `stageKeywordsNoNavigation()`
Stages keywords without navigation. Returns `{ success, signalId, message }`.

### `getStagingFlowMessages()`
Returns bilingual messages for toasts and UI.

### `buildStagingToastMessage()`
Formats toast messages as `[mainMsg, detailMsg]`.

### `buildOptimizerActionUrl()`
Returns optimizer path for "Go to Optimizer" button.

## Validation

✓ Keywords array not empty  
✓ All keywords have `term` property  
✓ All keywords have `category` property  
✓ No empty strings  
✓ No invalid data types  

## Error Messages (EN/AR)

| Error | EN | AR |
|-------|----|----|
| No keywords | "No keywords selected" | "لم يتم اختيار أي كلمات" |
| Invalid data | "Invalid keyword data..." | "بيانات الكلمات غير صالحة..." |
| Network error | "Network error..." | "خطأ في الاتصال..." |
| Staging failed | "Failed to stage keywords..." | "فشل إرسال الكلمات..." |

## Testing

```typescript
// Test successful staging
const result = await stageKeywordsNoNavigation(
  supabase,
  "ws-123",
  [{ term: "fitness app", category: "high_volume" }],
  "Fitbit",
  "comp-123",
  "app-456",
  "en"
);

console.log(result.success); // true
console.log(result.signalId); // "sig-xxx-yyy-zzz"
```

## Toast Examples

### Success (EN)
```
✅ Keywords staged for AI Listing Optimizer
   Sent 3 keywords from Apple analysis
   [Go to Optimizer] [Dismiss]
```

### Success (AR)
```
✅ تم إرسال الكلمات إلى محسِّن القائمة بنجاح
   تم إرسال 3 كلمات من تحليل Apple
   [انتقل إلى المحسِّن] [إغلاق]
```

### Error (EN)
```
❌ Failed to stage keywords. Please try again.
```

### Error (AR)
```
❌ فشل إرسال الكلمات. حاول مرة أخرى.
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Toast not showing | Check Toaster in app layout |
| Keywords don't appear in optimizer | Verify optimizer reads from vault |
| Arabic text RTL | Add `isRtl={locale === 'ar'}` to component |
| Navigation doesn't preserve locale | Use `@/i18n/navigation` router |

## Next Steps

1. ✅ Implementation complete
2. Test in development
3. Verify EN/AR flows work
4. Monitor Supabase logs for errors
5. Gather user feedback
6. Plan Phase 2 enhancements

## Support

Check `STAGING_FLOW_IMPLEMENTATION.md` for detailed documentation.
