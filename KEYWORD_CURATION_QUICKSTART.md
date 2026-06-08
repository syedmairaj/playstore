# Keyword Curation Engine - Quick Start Guide

**Time to integrate:** 15-30 minutes  
**Difficulty:** Easy (if following steps)

---

## 5-Minute Setup

### Step 1: Copy the Files (2 min)

Copy these 4 new files to your project:

```
✅ src/hooks/useKeywordSelection.ts
✅ src/components/competitor-spy/keyword-pill-curate.tsx
✅ src/components/competitor-spy/keyword-curation-floating-bar.tsx
✅ src/components/competitor-spy/keyword-surfaces-curation.tsx
```

### Step 2: Update Your Component (3 min)

In `src/components/competitor-spy/CompetitorSpySnapshotCard.tsx` or wherever you're using keywords:

**Find this:**
```tsx
import { KeywordSurfacesInline } from "@/components/competitor-spy/keyword-surfaces-inline";

// ... later in render ...
<KeywordSurfacesInline
  keywords={keywordSurfaces}
  count={keywordSurfaces.length}
  isRtl={isRtl}
  competitorPackageId={packageId}
  workspaceId={workspaceId}
/>
```

**Replace with:**
```tsx
import { KeywordSurfacesCuration } from "@/components/competitor-spy/keyword-surfaces-curation";

// ... later in render ...
<KeywordSurfacesCuration
  keywords={keywordSurfaces}
  count={keywordSurfaces.length}
  isRtl={isRtl}
  competitorPackageId={packageId}
  competitorName={competitorDisplayName}  // ← NEW (required)
  workspaceId={workspaceId}
  appId={appId}  // ← NEW (optional but recommended)
  language={locale === 'ar' ? 'ar' : 'en'}
  curateMode={true}  // ← NEW (enables multi-select)
/>
```

### Step 3: Test It (0 min - just refresh)

```bash
npm run dev  # If running
# Or just refresh your browser
```

✅ Done! Keywords should now be selectable.

---

## What You Get

When you click a keyword:
- ✅ Checkmark appears
- ✅ Color brightens
- ✅ Floating bar shows at bottom with "X Keywords Selected"
- ✅ Click "Send to AI Optimizer" to save

---

## Common Questions

### Q: Can I keep the old "copy" behavior?

**A:** Yes, set `curateMode={false}` to use copy-to-clipboard instead.

```tsx
<KeywordSurfacesCuration
  ...
  curateMode={false}  // ← Disables selection, enables copy
/>
```

### Q: Where does the data go?

**A:** Your `workspace_staging_vault` table with:
- `signal_type`: `optimizer_selection`
- `keywords`: Array of `{ term, category }`
- Fully validated before insert

### Q: How do I see what was sent?

**A:** Check your database:

```sql
SELECT 
  id,
  signal_type,
  created_at,
  metadata
FROM workspace_staging_vault
WHERE signal_type = 'optimizer_selection'
ORDER BY created_at DESC
LIMIT 5;
```

### Q: Does it work on mobile?

**A:** Yes! Floating bar adapts to mobile viewport.

### Q: Does it work in Arabic?

**A:** Yes! Full RTL support. Just set `isRtl={true}` or `locale="ar"`.

---

## Minimal Example

```tsx
"use client";

import { KeywordSurfacesCuration } from "@/components/competitor-spy/keyword-surfaces-curation";

export function MyComponent() {
  return (
    <KeywordSurfacesCuration
      keywords={['fitness', 'workout', 'trainer']}
      count={3}
      isRtl={false}
      competitorPackageId="com.myfitnesspal.android"
      competitorName="MyFitnessPal"
      workspaceId="workspace-123"
      appId="app-456"
      language="en"
      curateMode={true}
    />
  );
}
```

That's it! Keywords are now selectable.

---

## Customization

### Change Colors

Edit `getStrategyColor()` in `keyword-pill-curate.tsx`:

```typescript
function getStrategyColor(strategy, isSelected, curateMode) {
  const baseColors = {
    high_volume: {
      bg: "bg-blue-500/15",      // ← Change these
      border: "border-blue-500/40",
      text: "text-blue-300",
    },
    // ... etc
  };
}
```

### Change Floating Bar Position

Edit `keyword-curation-floating-bar.tsx` line ~120:

```tsx
className={cn(
  "fixed bottom-6 inset-x-6",           // ← Change bottom-6 or right-6
  "md:right-6 md:left-auto md:w-96"
)}
```

### Change Icons

Replace imports in components:

```tsx
import { Send, Check, Trash2 } from "lucide-react";
// Use any icons you prefer
```

---

## Troubleshooting

### Floating bar not showing?

- Check console for errors
- Verify `selectedCount > 0`
- Verify `workspaceId` is passed

### Keywords not saving?

- Check browser console for validation errors (🔍 log prefix)
- Verify `term` and `category` are non-empty strings
- Check RLS policies allow insert

### RTL not working?

- Verify `isRtl={true}` or `locale="ar"`
- Check Tailwind CSS includes `dir` attributes
- Verify font supports Arabic

---

## Files Reference

### Main Components

| File | Imports/Exports |
|------|-----------------|
| `keyword-pill-curate.tsx` | `KeywordPillCurate`, `KeywordPillCurateProps` |
| `keyword-curation-floating-bar.tsx` | `KeywordCurationFloatingBar`, `KeywordCurationFloatingBarProps` |
| `keyword-surfaces-curation.tsx` | `KeywordSurfacesCuration`, `KeywordSurfacesCurationProps` |

### Hooks

| File | Exports |
|------|---------|
| `useKeywordSelection.ts` | `useKeywordSelection`, `KeywordPayload`, `KeywordCategory` |

### Dependencies

```json
{
  "dependencies": {
    "framer-motion": "latest",
    "next-intl": "latest",
    "sonner": "latest",
    "lucide-react": "latest",
    "@supabase/auth-helpers-nextjs": "latest"
  }
}
```

---

## Next Steps

1. ✅ Copy the 4 files
2. ✅ Update your import in CompetitorSpySnapshotCard
3. ✅ Test in browser
4. ✅ Check database for saved signals
5. ✅ Deploy!

---

## Support

If you hit issues:

1. Check console logs (filter by `[StagingVault]` or `[KeywordSelection]`)
2. Verify all required props passed
3. Check database has `optimizer_selection` signals
4. Review full guide: `KEYWORD_CURATION_ENGINE_GUIDE.md`

---

**Ready?** Start with Step 1 above! 🚀
