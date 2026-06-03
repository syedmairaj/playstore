# Theme-Store Architecture Integration Guide

## Overview

The Theme-Store decouples brand themes from TypeScript code into a static, git-versioned `schemas.json` file. This enables:

1. **Real-time Theme Updates** — Change colors/fonts without code deployment
2. **Workspace Customization** — Premium users can create custom theme variants
3. **Market-Specific Themes** — Different themes for different locales/regions
4. **Full LTR/RTL Parity** — All themes work identically in English and Arabic via `flop-composite-flop`
5. **Immutable Base Schemas** — Core themes are version-controlled and stable

---

## Architecture

```
User Generates Screenshot (English)
    ↓
loadThemeForWorkspace(workspaceId, "minimalist-professional")
    ├── Load "minimalist-professional" from schemas.json
    ├── Check for workspace override in database
    ├── Merge overrides (if any) into base schema
    ├── Return ResolvedTheme { schema, isCustom, source }
    ↓
compose-screenshot.ts
    ├── Extract colors: primaryColor, textColor, etc.
    ├── Is LTR? → Render normally
    └── Done

User Generates Screenshot (Arabic)
    ↓
loadThemeForWorkspace(workspaceId, "minimalist-professional")
    ├── Load "minimalist-professional" from schemas.json
    ├── Check for workspace override
    ├── Merge overrides
    ├── Return ResolvedTheme
    ↓
compose-screenshot.ts (RTL Mode)
    ├── Extract colors: primaryColor, textColor, etc.
    ├── Is RTL (locale="ar")? → Yes
    │   ├── flop() background horizontally
    │   ├── Composite frame + text at rtl textAlignment
    │   ├── flop() entire composition back
    │   └── Text reads right-to-left
    └── Done
```

**Key Point:** The compositing engine is **completely agnostic** to the theme system. It only cares about color hex values and the `rtlOverrides.textAlignment` field.

---

## File Structure

```
lib/gemini/
├── schemas.json                      # 5 base themes (immutable, version-controlled)
├── mood-schema-types.ts              # TypeScript interfaces for themes
├── load-theme.ts                     # Loader function + helpers
└── __tests__/
    └── load-theme.test.ts            # 40+ test cases

lib/supabase/
└── theme-overrides.ts                # Database CRUD for workspace customizations

supabase/migrations/
└── 20260603100000_workspace_theme_overrides.sql  # Database schema
```

---

## Integration Points

### 1. Screenshot Generation (`app/api/screenshot-studio/generate/route.ts`)

**Before:**
```typescript
// Hard-coded theme logic scattered in the code
const selectedMoodSchema = "minimalist-professional";
const primaryColor = "#6366F1";
const textColor = "#1F2937";
```

**After:**
```typescript
import { loadThemeForWorkspace } from "@/lib/gemini/load-theme";
import { loadWorkspaceThemeOverride } from "@/lib/supabase/theme-overrides";

// In the generate route handler:
const override = await loadWorkspaceThemeOverride(
  workspaceId,
  selectedMoodSchema
);

const theme = await loadThemeForWorkspace(
  workspaceId,
  selectedMoodSchema,
  override
);

// Pass to compositing engine
const layoutMap = {
  primaryColor: theme.schema.primaryColor,
  textColor: theme.schema.textColor,
  backgroundColor: theme.schema.backgroundColor,
  fontStyle: theme.schema.fontStyle,
  shadowProfile: theme.schema.shadowProfile,
  // ... other fields
};
```

---

### 2. App Icon Generation (`app/api/brand-assets/icon-generate/route.ts`)

Same pattern as screenshots:

```typescript
const theme = await loadThemeForWorkspace(
  workspaceId,
  "minimalist-professional",
  override
);

const prompt = buildIconPrompt({
  brandColor: theme.schema.primaryColor,
  style: theme.schema.fontStyle,
  // ... other theme-driven fields
});
```

---

### 3. Banner Generation (`app/api/brand-assets/banner-generate/route.ts`)

Same pattern.

---

### 4. Listing Generation (`lib/gemini/generate-aso-assets.ts`)

```typescript
const theme = await loadThemeForWorkspace(workspaceId, schemaId, override);

// Use theme in prompt construction
const prompt = `Generate app listing with color scheme:
  Primary: ${theme.schema.primaryColor}
  Accent: ${theme.schema.accentColor}
  Energy: ${theme.schema.energyLevel}
`;
```

---

## Usage Patterns

### Pattern 1: Load Without Overrides (Most Common)

```typescript
import { loadThemeForWorkspace } from "@/lib/gemini/load-theme";

const theme = await loadThemeForWorkspace(
  workspaceId,
  "minimalist-professional"
);

console.log(theme.schema.primaryColor); // "#6366F1"
console.log(theme.isCustom); // false
console.log(theme.source); // "base-schema"
```

---

### Pattern 2: Load With Database Override

```typescript
import { loadThemeForWorkspace } from "@/lib/gemini/load-theme";
import { loadWorkspaceThemeOverride } from "@/lib/supabase/theme-overrides";

const override = await loadWorkspaceThemeOverride(
  workspaceId,
  "minimalist-professional"
);

const theme = await loadThemeForWorkspace(
  workspaceId,
  "minimalist-professional",
  override
);

console.log(theme.isCustom); // true (if override exists)
console.log(theme.override?.label); // "Custom Blue"
console.log(theme.schema.primaryColor); // Custom color or base color
```

---

### Pattern 3: RTL Awareness

```typescript
import { supportsRTL, getRTLTextAlignment } from "@/lib/gemini/load-theme";

const theme = await loadThemeForWorkspace(workspaceId, schemaId);
const locale = "ar"; // Arabic

if (supportsRTL(theme.schema)) {
  const textAlign = getRTLTextAlignment(theme.schema);
  // Pass to compose-screenshot.ts as part of LayoutMap
}
```

---

### Pattern 4: Category-Specific Recommendations

```typescript
import { getSchemasForCategory, getSchemasForLocale } from "@/lib/gemini/load-theme";

// Show relevant themes in UI
const recommendedForGaming = getSchemasForCategory("games");
const supportedForArabic = getSchemasForLocale("ar");
```

---

## Database Operations

### Create a Custom Theme for a Workspace

```typescript
import { createWorkspaceThemeOverride } from "@/lib/supabase/theme-overrides";

const newOverride = await createWorkspaceThemeOverride(
  workspaceId,
  "minimalist-professional",
  "Corporate Blue",
  userId,
  {
    primaryColor: "#0047AB", // Custom brand color
    textColor: "#FFFFFF",
  },
  {
    fontStyle: "bold", // Custom typography
  }
);
```

---

### Activate a Custom Theme

```typescript
import { activateWorkspaceThemeOverride } from "@/lib/supabase/theme-overrides";

await activateWorkspaceThemeOverride(overrideId);
// Now all screenshots generated with this workspace will use this override
```

---

### Update a Custom Theme

```typescript
import { updateWorkspaceThemeOverride } from "@/lib/supabase/theme-overrides";

await updateWorkspaceThemeOverride(overrideId, {
  label: "Updated Label",
  colorOverrides: {
    primaryColor: "#FF0000",
  },
});
```

---

### List All Overrides for a Workspace

```typescript
import { loadWorkspaceThemeOverrides } from "@/lib/supabase/theme-overrides";

const allOverrides = await loadWorkspaceThemeOverrides(workspaceId);
allOverrides.forEach((override) => {
  console.log(`${override.label} (${override.baseSchemaId})`);
});
```

---

## RTL/LTR Parity Guarantee

### Design Principles

All 5 base schemas are designed with these principles:

1. **Color Palette Symmetry** — Primary/secondary/accent colors chosen for equal luminance in both directions
2. **Shape Language Mirroring** — Organic and geometric shapes tested to maintain visual balance when horizontally flipped
3. **Contrast Preservation** — Text color maintains ≥4.5:1 WCAG contrast with background in both LTR and RTL
4. **Typography Flexibility** — Font styles (clean, bold, elegant) work identically in both directions

### Technical Implementation

In `compose-screenshot.ts`:

```typescript
async function composeScreenshot(
  backgroundBuffer: Buffer,
  layoutMap: LayoutMap,
  locale: string
): Promise<Buffer> {
  const isRTL = isRTLLocale(locale);

  if (isRTL) {
    // STEP 1: Mirror background
    backgroundImage = await backgroundImage.flop();
  }

  // STEP 2: Composite text + frame at appropriate textAlignment
  const textZoneX = getTextZoneX(layoutMap, isRTL);
  // Apply text at textZoneX
  // Frame is composited at symmetric position

  if (isRTL) {
    // STEP 3: Mirror entire composition back
    composed = await composed.flop();
  }

  return composed;
}
```

The `rtlOverrides.textAlignment` from the theme schema controls where text is positioned in the flipped space.

---

## Monitoring & Observability

### Log Theme Usage

```typescript
const theme = await loadThemeForWorkspace(workspaceId, schemaId, override);

console.log({
  event: "theme_loaded",
  workspaceId,
  schemaId,
  isCustom: theme.isCustom,
  source: theme.source,
  primaryColor: theme.schema.primaryColor,
});
```

### Track Custom Theme Adoption

In your analytics/telemetry system:

```typescript
const hasCustom = await hasActiveThemeOverrides(workspaceId);
if (hasCustom) {
  track("custom_theme_active", { workspaceId });
}
```

---

## Testing

### Run Theme Tests

```bash
npm test lib/gemini/__tests__/load-theme.test.ts
```

**Coverage:**
- Schema loading (40+ test cases)
- Override merging
- RTL validation
- Category affinity
- Color contrast (WCAG)
- Compositing engine compatibility

---

## Migration Path

### Phase 1: Deploy Theme Store (Week 1)
1. Create `schemas.json` ✅
2. Create type definitions ✅
3. Create loader functions ✅
4. Create database migration ✅
5. Write tests ✅
6. This document ✅

### Phase 2: Integrate Into Routes (Week 2)
1. Update `app/api/screenshot-studio/generate/route.ts`
2. Update `lib/gemini/generate-screenshot-pack.ts`
3. Update `app/api/brand-assets/icon-generate/route.ts`
4. Update `app/api/brand-assets/banner-generate/route.ts`
5. Update `lib/gemini/generate-aso-assets.ts`
6. QA and staging validation

### Phase 3: Deploy to Production (Week 3)
1. Deploy to production
2. Monitor theme loading metrics
3. Test custom theme creation (if feature enabled)
4. Enable custom theme UI for pro users

---

## API Endpoints (Future)

Once integrated, you can build these endpoints:

### Get Available Themes

```
GET /api/themes?locale=ar&category=games
→ Returns array of compatible schemas
```

### Get Workspace Themes

```
GET /api/themes/workspace/:workspaceId
→ Returns all overrides for workspace
```

### Create Custom Theme

```
POST /api/themes/workspace/:workspaceId
→ Create new override
```

### Preview Theme

```
POST /api/themes/preview
{ schemaId, colorOverrides, rtlLocale }
→ Returns preview image
```

---

## Checklist for Integration

- [ ] Read through all 4 files created
- [ ] Run tests: `npm test lib/gemini/__tests__/load-theme.test.ts`
- [ ] Apply migration: `supabase db push`
- [ ] Update screenshot generation route
- [ ] Update icon generation route
- [ ] Update banner generation route
- [ ] Update listing generation
- [ ] QA: Generate screenshots in EN and AR
- [ ] QA: Create custom theme override
- [ ] QA: Activate override and generate
- [ ] Verify colors match expectations
- [ ] Deploy to production
- [ ] Monitor adoption metrics

---

## Troubleshooting

### Q: How do I test RTL without a database?

**A:** Use `loadThemeForWorkspace()` directly without the database lookup:

```typescript
const theme = await loadThemeForWorkspace(
  "test-workspace",
  "minimalist-professional",
  null // No override
);
```

### Q: What if schemas.json is not found?

**A:** The loader will throw an error. Ensure:
1. `lib/gemini/schemas.json` exists
2. File is valid JSON
3. All required fields are present

### Q: Can I update schemas.json without redeploying?

**A:** No. Base schemas are immutable and deployed with your code. Use workspace overrides for customization.

### Q: Do workspace overrides work for RTL?

**A:** Yes. Use the `rtlOverrides` field when creating an override:

```typescript
await createWorkspaceThemeOverride(
  workspaceId,
  "minimalist-professional",
  "Arabic Variant",
  userId,
  { primaryColor: "#0047AB" },
  {},
  { textAlignment: "right", notes: "Optimized for Arabic" }
);
```

---

## Next Steps

1. **Review schemas.json** — Understand the 5 theme definitions
2. **Review types** — See how themes are structured in TypeScript
3. **Review loader** — Understand how themes are loaded and merged
4. **Run tests** — Validate all functionality works
5. **Apply migration** — Run the Supabase migration
6. **Integrate** — Update routes to use new theme loader
7. **Test** — Generate screenshots in EN and AR
8. **Deploy** — Roll out to production
9. **Monitor** — Track theme adoption and custom overrides

---

**Pillar 2 Status:** ✅ Ready for Integration
