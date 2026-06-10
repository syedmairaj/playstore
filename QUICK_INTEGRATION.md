# Quick Start: 30-Minute Integration

**Get contextual features live in 3 simple phases**

---

## Phase 1: Copy Files (5 min)

```bash
# 1. Create directories if they don't exist
mkdir -p src/components/keyword-tracker
mkdir -p src/components/listing-optimizer

# 2. Copy new components
cp keyword-validator-drawer.tsx src/components/keyword-tracker/
cp keyword-tracker-refactored.tsx src/components/keyword-tracker/
cp experiment-history-panel.tsx src/components/listing-optimizer/
cp listing-optimizer-refactored.tsx src/components/listing-optimizer/

# ✅ 4 new files in place
```

---

## Phase 2: Update Pages (10 min)

### Step 1: `app/[locale]/app/[workspaceId]/keywords/page.tsx`

Replace entire file:
```typescript
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { KeywordTrackerRefactored } from "@/components/keyword-tracker/keyword-tracker-refactored";

interface PageProps {
  params: Promise<{ locale: string; workspaceId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { workspaceId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) notFound();

  return (
    <div className="space-y-4">
      <KeywordTrackerRefactored workspaceId={workspaceId} />
    </div>
  );
}

export async function generateMetadata() {
  return {
    title: "Keyword Tracker",
    description: "Track and validate keywords for your app",
  };
}
```

### Step 2: `app/[locale]/app/[workspaceId]/listing-optimizer/page.tsx`

Replace entire file:
```typescript
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceRole } from "@/lib/workspace/membership";
import { ListingOptimizerRefactored } from "@/components/listing-optimizer/listing-optimizer-refactored";

interface PageProps {
  params: Promise<{ locale: string; workspaceId: string }>;
}

export default async function Page({ params }: PageProps) {
  const { workspaceId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) notFound();

  return (
    <div className="space-y-4">
      <ListingOptimizerRefactored workspaceId={workspaceId} />
    </div>
  );
}

export async function generateMetadata() {
  return {
    title: "AI Listing Optimizer",
    description: "Enhance your listing with AI suggestions",
  };
}
```

---

## Phase 3: Update Navigation (5 min)

Edit: `app/[locale]/app/[workspaceId]/layout.tsx`

Find the `navItemsAll` array and remove these lines:
```typescript
// ❌ REMOVE THESE:
{ href: `${appBase}/keyword-validator`, label: "  ├─ Keyword Validator", show: flags.keyword_tracker },
{ href: `${appBase}/listing-optimizer/snapshots`, label: "  ├─ Snapshots", show: flags.listing_optimizer },
```

Keep these (they now contain integrated features):
```typescript
// ✅ KEEP THESE:
{ href: `${appBase}/keywords`, label: t("keywords"), show: flags.keyword_tracker },
{ href: `${appBase}/listing-optimizer`, label: t("listingAi"), show: flags.listing_optimizer },
```

---

## Test It (5 min)

### ✅ Keyword Tracker
```
1. Open PlayStore > Keyword Tracker
2. Click "+ Validate Keyword" button
3. Drawer slides in from side
4. Enter "photo editor"
5. Click Validate
6. See results in drawer
7. Click "✓ Add to Context"
8. Keyword appears in list with badge
```

### ✅ AI Listing Optimizer
```
1. Open PlayStore > AI Listing Optimizer
2. Select an app from dropdown
3. Click "Experiments & Versions" tab
4. See: Current Baseline section
5. Try: Create Baseline button
6. Try: New Variant button
```

---

## Done! 🎉

Total time: **30 minutes**  
Breaking changes: **0**  
Backend changes: **0**

Your ASO platform is now **feature-focused, not feature-bloated!** 🚀

---

See full documentation:
- Architecture: `CONTEXTUAL_INTEGRATION_ARCHITECTURE.md`
- Implementation: `INTEGRATION_IMPLEMENTATION_GUIDE.md`
- Summary: `REFACTORING_SUMMARY.md`
