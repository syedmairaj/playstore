# Mood Schema Framework Integration — Complete Guide

**Status**: ✅ **Integrated into `generateScreenshotLayout.ts`**

---

## Overview

The Mood Schema framework has been fully integrated into the screenshot generation pipeline. Gemini now selects from 5 pre-validated schemas instead of inventing colors, preventing the "green fallback" bug while ensuring palette safety and consistency.

---

## Architecture Changes

### New File: `lib/gemini/mood-schema.ts`

**Purpose**: Single source of truth for all 5 Mood Schemas.

**Exports**:
- `MOOD_SCHEMAS`: Immutable record of 5 pre-validated schemas
- `selectMoodSchemaForCategory()`: AI-free category-to-schema mapper
- `getValidSchemaIds()`: List of valid schema IDs for Gemini validation
- `formatSchemaForGemini()`: Formats schemas as JSON constraints for Gemini

**Schema Structure**:
```typescript
interface MoodSchema {
  id: MoodSchemaType;                    // "minimalist-professional" | ...
  label: string;                         // Display name
  description: string;                   // Human-readable description
  primaryColor: string;                  // Hex color #RRGGBB
  secondaryColor: string;                // Hex color #RRGGBB
  fontStyle: FontStyle;                  // "bold" | "elegant" | "clean"
  shadowProfile: ShadowProfile;          // "sharp" | "soft-spread" | "subtle" | "hard-edge" | "deep"
  aestheticKeywords: string[];           // FLUX-ready visual descriptors
  categoryAffinities: string[];          // App categories this schema suits
  luminance: "dark" | "light";           // Overall background luminance
}
```

### Updated File: `lib/gemini/generate-screenshot-layout.ts`

**Changes**:

#### 1. Enhanced LayoutMap Type
Added three new fields for schema-driven asset selection:
```typescript
selectedSchema: MoodSchemaType;
typographyConfig: {
  primaryColor: string;
  fontStyle: "bold" | "elegant" | "clean";
  shadowProfile: "sharp" | "soft-spread" | "subtle" | "hard-edge" | "deep";
};
```

#### 2. Updated LAYOUT_SCHEMA (Gemini constraint)
Extended structured output schema to include:
- `selectedSchema` (required string)
- `typographyConfig` (required object with 3 required fields)

#### 3. Schema Selector Logic
```typescript
const STYLE_TO_MOOD_SCHEMA: Record<string, MoodSchemaType> = {
  Minimalist:     "minimalist-professional",
  Modern:         "energetic-tech",
  Bold:           "high-contrast-bold",
  Playful:        "organic-health",
  Professional:   "minimalist-professional",
  "Flat Design":  "energetic-tech",
};
```

Backward-compatible: existing `style` enum values map to schemas automatically.

#### 4. Enhanced Prompt Builder (buildLayoutPrompt)
- **Pre-selection**: Automatically selects optimal schema for category
- **Schema Injection**: Formats all 5 schemas as Gemini constraints
- **Highest Priority**: "NO DEVICE FRAME" constraint emphasized at top
- **Schema Keywords**: Gemini explicitly told to use only schema aesthetic keywords
- **Typography Mapping**: Prompt includes specific fontStyle and shadowProfile from selected schema

**Key constraint block**:
```
═══════════════════════════════════════════════════════════════════════════════════
🎨 MOOD SCHEMA FRAMEWORK — YOU ARE A SELECTOR, NOT AN INVENTOR
═══════════════════════════════════════════════════════════════════════════════════

Your PRIMARY task is to SELECT ONE of these 5 pre-validated Mood Schemas.
Do NOT create custom colors, fonts, or shadow profiles. Use ONLY what is defined.
```

#### 5. Enhanced Parsing (parseLayoutMap)
New validators for schema fields:
- `parseSelectedSchema()`: Validates schema ID, falls back to "energetic-tech"
- `parseFontStyle()`: Validates font personality
- `parseShadowProfile()`: Validates shadow profile enum

If Gemini returns invalid values, fallback uses the category-inferred schema's defaults.

---

## The 5 Mood Schemas

### 1. Minimalist Professional
**ID**: `minimalist-professional`
- **Colors**: `#1E293B` (slate-900) + `#64748B` (slate-500)
- **Font**: clean
- **Shadow**: sharp
- **Luminance**: light
- **Categories**: finance, banking, fintech, investment, business, productivity, tools, utilities, professional-services, corporate
- **Keywords**: ultra-clean white space, minimal geometric forms, sharp edges, professional restraint, high contrast, generous negative space, corporate premium, refined typography

### 2. Energetic Tech
**ID**: `energetic-tech`
- **Colors**: `#6366F1` (indigo-500) + `#A855F7` (purple-500)
- **Font**: bold
- **Shadow**: soft-spread
- **Luminance**: dark
- **Categories**: tech, apps, software, saas, startup, ai, machine-learning, gaming, entertainment, social, communication, messaging
- **Keywords**: electric gradient, vibrant colour blocking, dynamic diagonal bands, bold geometric shapes, contemporary energy, tech-forward, glowing accents, kinetic motion, saturated palette

### 3. Organic Health
**ID**: `organic-health`
- **Colors**: `#0F766E` (teal-700) + `#CCFBF1` (teal-100)
- **Font**: clean
- **Shadow**: subtle
- **Luminance**: light
- **Categories**: health, fitness, wellness, medical, nutrition, food, lifestyle, meditation, mindfulness, mental-health, ecology, sustainability, beauty
- **Keywords**: earthy warm palette, soft pastel tones, organic flowing shapes, natural textures, gentle gradients, wellness-focused, calming atmosphere, botanical accents, sustainable, human-centered

### 4. High-Contrast Bold
**ID**: `high-contrast-bold`
- **Colors**: `#000000` (pure black) + `#EF4444` (red-500)
- **Font**: bold
- **Shadow**: hard-edge
- **Luminance**: dark
- **Categories**: gaming, music, entertainment, fashion, sports, fitness, lifestyle, streetwear, creative, design, alternative, skateboard
- **Keywords**: high contrast black & white, neon accent, bold sans-serif, stark composition, maximum impact, edgy aesthetic, hard geometric shapes, graphic design intensity, eye-catching, punk rock energy

### 5. Luxury Premium
**ID**: `luxury-premium`
- **Colors**: `#78350F` (amber-900) + `#FDE68A` (amber-200)
- **Font**: elegant
- **Shadow**: deep
- **Luminance**: light
- **Categories**: luxury, fashion, beauty, jewelry, finance-premium, real-estate, travel, hospitality, wellness-luxury, automotive
- **Keywords**: luxury aesthetic, champagne & gold accents, dark metallic tones, elegant serif typography, sophisticated composition, premium materials, refined minimalism, exclusive atmosphere, timeless elegance, aspirational design

---

## Data Flow

### Screenshot Generation Request
```
POST /api/screenshot-studio/generate
{
  "appName": "MyFinanceApp",
  "category": "finance",
  "brandColor": null,
  "style": "Professional"
}
```

### Processing Flow
```
1. generateScreenshotLayout() called
   ↓
2. selectMoodSchemaForCategory("finance")
   ↓
   Returns: MOOD_SCHEMAS["minimalist-professional"]
   ↓
3. buildLayoutPrompt() constructs:
   • Pre-validated 5 schemas as JSON blocks
   • Selected schema marked as "recommended"
   • Explicit "NO DEVICE FRAME" priority
   • Schema aesthetic keywords only
   • Typography config constraints
   ↓
4. Gemini receives prompt with schema constraints
   • MUST select one of 5 schema IDs
   • MUST use only that schema's colors
   • MUST use only that schema's keywords
   ↓
5. Gemini returns:
   {
     "backgroundPrompt": "ultra-clean minimal finance dashboard background...",
     "selectedSchema": "minimalist-professional",
     "typographyConfig": {
       "primaryColor": "#1E293B",
       "fontStyle": "clean",
       "shadowProfile": "sharp"
     },
     ...rest of LayoutMap fields
   }
   ↓
6. parseLayoutMap() validates:
   • selectedSchema is in valid list
   • typographyConfig fields are valid enums
   • Falls back to category-inferred schema if invalid
   ↓
7. Return enriched LayoutMap with schema metadata
   ↓
8. sharp compositing uses typographyConfig to:
   • Load appropriate font asset (clean = Inter-Bold, elegant = PlayfairDisplay-Bold, etc)
   • Apply shadow profile (sharp = hard-edge SVG, soft-spread = Gaussian blur, etc)
   • Build typography overlay with primaryColor
```

---

## Integration with sharp Compositing Pipeline

### Expected sharp Usage

Your `composeScreenshot()` function should now:

1. **Check selectedSchema**:
   ```typescript
   const schema = MOOD_SCHEMAS[layoutMap.selectedSchema];
   ```

2. **Load Typography Assets**:
   ```typescript
   const fontPath = {
     "bold": "/fonts/Poppins-ExtraBold.ttf",
     "elegant": "/fonts/PlayfairDisplay-Bold.ttf",
     "clean": "/fonts/Inter-Bold.ttf",
   }[layoutMap.typographyConfig.fontStyle];
   ```

3. **Apply Shadow Profile**:
   ```typescript
   const shadowConfig = {
     "sharp": { offset: 2, opacity: 0.8, blur: 0 },
     "soft-spread": { offset: 4, opacity: 0.4, blur: 8 },
     "subtle": { offset: 1, opacity: 0.3, blur: 2 },
     "hard-edge": { offset: 3, opacity: 1, blur: 0 },
     "deep": { offset: 6, opacity: 0.6, blur: 12 },
   }[layoutMap.typographyConfig.shadowProfile];
   ```

4. **Render Typography**:
   ```typescript
   image.composite([
     {
       input: await generateTextOverlay({
         text: headline,
         color: layoutMap.typographyConfig.primaryColor,
         font: fontPath,
         shadow: shadowConfig,
       }),
       left: textX,
       top: textY,
     }
   ]);
   ```

---

## Constraint Enforcement

### Why This Works

1. **Gemini can only SELECT, not INVENT**
   - Schema list is hardcoded in prompt as JSON blocks
   - Gemini told explicitly: "Do NOT create custom colors"
   - LayoutMap schema includes enum validation

2. **NO DEVICE FRAME is now HIGHEST PRIORITY**
   - Appears at top of prompt in warning block
   - Embedded in all schema aesthetic keywords
   - Referenced in both constraint 1 and constraint 5

3. **Color Safety**
   - Brand color is optional; schema provides default
   - If no brand color: fallback to schema's primaryColor
   - Never falls back to green (#22C55E)

4. **Typography is Deterministic**
   - Font style is constrained to 3 options
   - Shadow profile is constrained to 5 options
   - sharp pipeline knows exactly which assets to load

---

## Testing Scenarios

### Test 1: Finance App (No Brand Color)
```json
{
  "appName": "WealthTracker",
  "category": "finance",
  "brandColor": null,
  "style": "Professional"
}
```

**Expected Output**:
- `selectedSchema`: "minimalist-professional"
- `accentColor`: "#1E293B" (slate-900)
- `typographyConfig.fontStyle`: "clean"
- `typographyConfig.shadowProfile`: "sharp"
- `backgroundPrompt`: Includes "ultra-clean white space", "minimal geometric", "sharp edges"

### Test 2: Gaming App with Orange Brand Color
```json
{
  "appName": "ActionHero",
  "category": "gaming",
  "brandColor": "#EF6820",
  "style": "Bold"
}
```

**Expected Output**:
- `selectedSchema`: "high-contrast-bold"
- `accentColor`: "#EF6820" (user's orange, overrides schema)
- `accentColorSecondary`: darker orange (derived via HSL)
- `typographyConfig.fontStyle`: "bold"
- `typographyConfig.shadowProfile`: "hard-edge"
- `backgroundPrompt`: Includes "high contrast", "neon accent", "stark composition", "bold sans-serif"

### Test 3: Wellness App
```json
{
  "appName": "MindfulMoments",
  "category": "meditation",
  "brandColor": null,
  "style": "Playful"
}
```

**Expected Output**:
- `selectedSchema`: "organic-health"
- `accentColor`: "#0F766E" (teal-700)
- `typographyConfig.fontStyle`: "clean"
- `typographyConfig.shadowProfile`: "subtle"
- `backgroundPrompt`: Includes "earthy warm palette", "organic flowing", "calming atmosphere", "botanical"

### Test 4: Luxury App with Custom Color
```json
{
  "appName": "PlatinumLounge",
  "category": "luxury",
  "brandColor": "#A78BFA",
  "style": "Professional"
}
```

**Expected Output**:
- `selectedSchema`: "luxury-premium"
- `accentColor`: "#A78BFA" (user's purple, overrides schema)
- `accentColorSecondary`: darker purple (derived)
- `typographyConfig.fontStyle`: "elegant"
- `typographyConfig.shadowProfile`: "deep"
- `backgroundPrompt`: Includes "luxury aesthetic", "champagne & gold", "elegant serif", "sophisticated composition"

---

## Backward Compatibility

**No Breaking Changes**:
- Existing `style` enum values still work (mapped via `STYLE_TO_MOOD_SCHEMA`)
- Existing `brandColor` and `primaryColor` parameters still respected
- Existing `GenerateScreenshotLayoutInput` interface unchanged
- LayoutMap additions are new fields; existing fields untouched

**Graceful Fallbacks**:
- If Gemini returns invalid schema ID → defaults to "energetic-tech"
- If typographyConfig missing/invalid → uses schema defaults
- If Gemini returns unknown fontStyle → defaults to "clean"
- If Gemini returns unknown shadowProfile → defaults to "subtle"

---

## Next Steps

1. **Update composeScreenshot()** to use `layoutMap.selectedSchema` and `layoutMap.typographyConfig`
2. **Add font assets** to your project:
   - Inter-Bold (clean)
   - Poppins-ExtraBold (bold)
   - Lato-SemiBold (organic)
   - Montserrat-Black (bold)
   - PlayfairDisplay-Bold (elegant)
3. **Implement shadow profile rendering** in sharp:
   - sharp | soft-spread | subtle | hard-edge | deep
4. **Test with 4 scenarios** above
5. **Monitor Gemini responses** to verify schema selection accuracy
6. **Update PROJECT_STATUS.md** with Mood Schema system in Section 7

---

## File Summary

| File | Changes |
|------|---------|
| `lib/gemini/mood-schema.ts` | NEW — 5 pre-validated schemas + selector logic |
| `lib/gemini/generate-screenshot-layout.ts` | Enhanced LayoutMap type, schema routing, Gemini constraints |
| `app/api/screenshot-studio/generate/route.ts` | No changes (works with new LayoutMap) |
| `lib/screenshot/compose-screenshot.ts` | TODO: Use `selectedSchema` + `typographyConfig` |

---

## Validation Checklist

- [x] Mood Schema framework defined in `mood-schema.ts`
- [x] 5 schemas with complete metadata (colors, fonts, shadows)
- [x] Category-to-schema affinity mapping
- [x] LayoutMap type extended with schema fields
- [x] LAYOUT_SCHEMA validation updated
- [x] Gemini prompt enforces schema selection
- [x] "NO DEVICE FRAME" as highest priority
- [x] buildLayoutPrompt includes schema constraints
- [x] parseLayoutMap validates schema fields
- [x] Fallback logic uses schema defaults
- [x] Backward compatibility maintained
- [ ] sharp compositing pipeline updated
- [ ] Font assets added to project
- [ ] Shadow profile rendering implemented
- [ ] End-to-end testing with 4 scenarios
- [ ] PROJECT_STATUS.md updated

---

