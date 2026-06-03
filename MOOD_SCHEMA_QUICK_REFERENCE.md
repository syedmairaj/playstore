# Mood Schema Quick Reference — Developer Cheat Sheet

---

## Schema Selection by Category

```
CATEGORY                    → SCHEMA
────────────────────────────────────────────────────────────
Finance, Banking            → minimalist-professional (#1E293B)
FinTech, Investment         → minimalist-professional (#1E293B)
Productivity, Tools         → minimalist-professional (#1E293B)
Business, Corporate         → minimalist-professional (#1E293B)

Tech, SaaS, Startup         → energetic-tech (#6366F1)
AI, Machine-Learning        → energetic-tech (#6366F1)
Gaming, Entertainment       → energetic-tech (#6366F1)
Social, Messaging           → energetic-tech (#6366F1)
Communication, Apps         → energetic-tech (#6366F1)

Health, Fitness, Wellness   → organic-health (#0F766E)
Medical, Mental-Health      → organic-health (#0F766E)
Meditation, Mindfulness     → organic-health (#0F766E)
Food, Nutrition, Lifestyle  → organic-health (#0F766E)
Ecology, Sustainability     → organic-health (#0F766E)
Beauty                      → organic-health (#0F766E)

Gaming, Music               → high-contrast-bold (#000000)
Entertainment, Fashion      → high-contrast-bold (#000000)
Sports, Streetwear          → high-contrast-bold (#000000)
Creative, Design            → high-contrast-bold (#000000)
Alternative, Skateboard     → high-contrast-bold (#000000)

Luxury, Fashion, Beauty     → luxury-premium (#78350F)
Jewelry, Finance-Premium    → luxury-premium (#78350F)
Real-Estate, Travel         → luxury-premium (#78350F)
Hospitality, Automotive     → luxury-premium (#78350F)
```

---

## Palette Reference

```
┌─────────────────────────────────────────────────────────────────────┐
│ MINIMALIST PROFESSIONAL                                             │
├─────────────────────────────────────────────────────────────────────┤
│ Primary:    #1E293B  (Slate-900 - Deep charcoal)                   │
│ Secondary:  #64748B  (Slate-500 - Medium grey)                     │
│ Font:       clean (Inter-Bold)                                      │
│ Shadow:     sharp (2px offset, 0.8 opacity, no blur)               │
│ Luminance:  light                                                    │
│ Feel:       Corporate, trustworthy, minimal, clean-edged            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ ENERGETIC TECH                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ Primary:    #6366F1  (Indigo-500 - Electric blue)                  │
│ Secondary:  #A855F7  (Purple-500 - Vibrant purple)                 │
│ Font:       bold (Poppins-ExtraBold)                               │
│ Shadow:     soft-spread (4px offset, 0.4 opacity, 8px blur)        │
│ Luminance:  dark                                                     │
│ Feel:       Modern, energetic, cutting-edge, dynamic                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ ORGANIC HEALTH                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ Primary:    #0F766E  (Teal-700 - Deep teal)                        │
│ Secondary:  #CCFBF1  (Teal-100 - Pale mint)                        │
│ Font:       clean (Lato-SemiBold)                                   │
│ Shadow:     subtle (1px offset, 0.3 opacity, 2px blur)             │
│ Luminance:  light                                                    │
│ Feel:       Natural, calming, nurturing, organic                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ HIGH-CONTRAST BOLD                                                  │
├─────────────────────────────────────────────────────────────────────┤
│ Primary:    #000000  (Pure black)                                   │
│ Secondary:  #EF4444  (Red-500 - Neon red)                          │
│ Font:       bold (Montserrat-Black)                                │
│ Shadow:     hard-edge (3px offset, 1.0 opacity, no blur)           │
│ Luminance:  dark                                                     │
│ Feel:       Edgy, bold, high-impact, rebellious                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ LUXURY PREMIUM                                                      │
├─────────────────────────────────────────────────────────────────────┤
│ Primary:    #78350F  (Amber-900 - Dark metallic)                   │
│ Secondary:  #FDE68A  (Amber-200 - Champagne/gold)                  │
│ Font:       elegant (PlayfairDisplay-Bold)                         │
│ Shadow:     deep (6px offset, 0.6 opacity, 12px blur)              │
│ Luminance:  light                                                    │
│ Feel:       Elegant, exclusive, sophisticated, timeless             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Font Mapping

```
fontStyle          → Font File                      → Use Case
───────────────────────────────────────────────────────────────────
"clean"       →   Inter-Bold                       Professional, clean
"bold"        →   Poppins-ExtraBold               Energetic, modern
"elegant"     →   PlayfairDisplay-Bold            Luxury, sophisticated
```

---

## Shadow Profile Mapping

```
shadowProfile      → Config (offset, opacity, blur) → Visual Effect
────────────────────────────────────────────────────────────────────
"sharp"            (2px, 0.8, 0px)                Crisp, defined
"soft-spread"      (4px, 0.4, 8px)                Diffused glow
"subtle"           (1px, 0.3, 2px)                Minimal, refined
"hard-edge"        (3px, 1.0, 0px)                Maximum contrast
"deep"             (6px, 0.6, 12px)               Pronounced, elegant
```

---

## Text Position Mapping

```
textPosition    → Y Coordinate   → Slide Type
────────────────────────────────────────────────
"top"           200px            SLIDE 1 (Hero), SLIDE 6 (CTA)
"center"        960px            SLIDE 3 (Feature), SLIDE 4 (Feature)
"bottom"        1700px           SLIDE 2 (Feature), SLIDE 5 (Trust)
```

---

## Gemini Prompt Sections (Order of Priority)

```
PRIORITY 1:  🚫 CRITICAL CONSTRAINT
             "BACKGROUND ONLY — NO DEVICE FRAME"
             Appears at TOP of prompt before anything else

PRIORITY 2:  🎨 MOOD SCHEMA FRAMEWORK
             All 5 schemas listed as JSON blocks
             "YOU ARE A SELECTOR, NOT AN INVENTOR"
             Recommended schema marked

PRIORITY 3:  🏢 BRAND CONTEXT
             App details, category, brand color
             Palette description

PRIORITY 4:  📐 LAYOUT GEOMETRY
             Canvas dimensions, frame position (RTL/LTR)

PRIORITY 5:  ✅ TASK + CONSTRAINTS
             5 mandatory constraints listed
             Negative exclusions reinforced
```

---

## LayoutMap Output Fields

```json
{
  "backgroundPrompt": "string",              // For Runware FLUX
  "negativeAdditions": "string",             // For Runware negative
  "textPosition": "top|center|bottom",       // For sharp compositor
  "textColor": "#ffffff|#0f0f0f",            // For contrast
  "accentColor": "#RRGGBB",                  // Primary brand color
  "accentColorSecondary": "#RRGGBB",         // Secondary brand color
  "backgroundMood": "string",                // Debug label
  "uiMockDescription": "string",             // For Android frame
  "backgroundLuminance": "dark|light",       // For contrast
  "selectedSchema": "schema-id",             // NEW: Selected schema
  "typographyConfig": {                      // NEW: Asset selection
    "primaryColor": "#RRGGBB",               // Text color hex
    "fontStyle": "bold|elegant|clean",       // Font personality
    "shadowProfile": "shadow-id"             // Shadow rendering style
  }
}
```

---

## Common Scenarios

### Scenario 1: Finance App, No Brand Color
```
Input:  { category: "finance", brandColor: null }
Output: selectedSchema: "minimalist-professional"
        typographyConfig: { primaryColor: "#1E293B", fontStyle: "clean", shadowProfile: "sharp" }
Result: Professional, sharp-edged finance app with slate colors
```

### Scenario 2: Gaming App, Orange Brand Color
```
Input:  { category: "gaming", brandColor: "#FF6B35" }
Output: selectedSchema: "high-contrast-bold"
        typographyConfig: { primaryColor: "#FF6B35", fontStyle: "bold", shadowProfile: "hard-edge" }
        accentColor: "#FF6B35" (overrides schema primary)
Result: Bold gaming app with user's orange + hard shadows
```

### Scenario 3: Health App
```
Input:  { category: "wellness", brandColor: null }
Output: selectedSchema: "organic-health"
        typographyConfig: { primaryColor: "#0F766E", fontStyle: "clean", shadowProfile: "subtle" }
Result: Calming health app with teal + subtle shadows
```

### Scenario 4: Luxury App
```
Input:  { category: "luxury", brandColor: null }
Output: selectedSchema: "luxury-premium"
        typographyConfig: { primaryColor: "#78350F", fontStyle: "elegant", shadowProfile: "deep" }
Result: Sophisticated luxury app with elegant serif + deep shadows
```

---

## Fallback Behavior

```
Scenario: Gemini returns invalid selectedSchema
Action:   parseSelectedSchema() validates against getValidSchemaIds()
Fallback: If invalid, return "energetic-tech" (most versatile)

Scenario: typographyConfig missing or malformed
Action:   parseLayoutMap() uses schema defaults
Fallback: fontStyle defaults to "clean", shadowProfile to "subtle"

Scenario: Gemini returns no accentColor
Action:   parseHex() returns fallback
Fallback: brandColor if provided, else schema.primaryColor, else #6366F1

Scenario: Gemini includes device frame in backgroundPrompt
Action:   Negative prompt filtering + RTL composition handles it
Fallback: If FLUX still includes frame, sharp compositingalso applies frame
Result:   Deterministic frame overlay ensures correctness
```

---

## Validation Checklist for Outputs

```
✅ backgroundPrompt checks:
   - Does NOT contain: phone, smartphone, iPhone, Android, device, frame, mockup, screen
   - DOES state: "background only" or "no device frame"
   - Uses aesthetic keywords from selected schema

✅ selectedSchema checks:
   - Is one of: minimalist-professional, energetic-tech, organic-health, high-contrast-bold, luxury-premium
   - Matches category affinity

✅ typographyConfig checks:
   - fontStyle is one of: bold, elegant, clean
   - shadowProfile is one of: sharp, soft-spread, subtle, hard-edge, deep
   - primaryColor is valid hex (#RRGGBB)

✅ Color palette checks:
   - accentColor matches schema primary (unless brandColor provided)
   - accentColorSecondary is darker/complementary version
   - No green (#22C55E) fallback
   - Consistent across all 6 slides

✅ Constraint compliance:
   - 30% negative space preserved (frame zone)
   - RTL geometry correct (frame left, active zone right)
   - No text in negative space zone
   - Luminance matches schema default
```

---

## Debugging Quick Reference

| Issue | Check | Fix |
|-------|-------|-----|
| Green color appearing | `accentColor` | Verify brandColor is null → schema should provide color. Check fallbackAccent in parseLayoutMap. |
| Device frame in image | `backgroundPrompt` | Verify prompt states "NO DEVICE FRAME". Check Runware negative prompt is complete. |
| Wrong font loading | `typographyConfig.fontStyle` | Verify fontStyle is clean/bold/elegant. Check fontMap has all 3 keys. |
| Shadow not rendering | `typographyConfig.shadowProfile` | Verify shadowProfile is valid enum. Check SHADOW_PROFILES in composeScreenshot. |
| Wrong category schema | Category passed | Verify selectMoodSchemaForCategory() receives correct category. Check categoryAffinities in mood-schema.ts. |
| RTL text wrong way | `locale` in isRTLLocale() | Verify locale is "ar". Check flop() logic in composeScreenshot. |

---

## Copy-Paste Integration Points

### 1. In composeScreenshot() — Load Font
```typescript
const fontMap = {
  bold: "/public/fonts/Poppins-ExtraBold.ttf",
  elegant: "/public/fonts/PlayfairDisplay-Bold.ttf",
  clean: "/public/fonts/Inter-Bold.ttf",
};
const fontPath = fontMap[layoutMap.typographyConfig.fontStyle];
```

### 2. In composeScreenshot() — Get Shadow Config
```typescript
const SHADOW_PROFILES = {
  sharp: { offset: 2, opacity: 0.8, blur: 0 },
  "soft-spread": { offset: 4, opacity: 0.4, blur: 8 },
  subtle: { offset: 1, opacity: 0.3, blur: 2 },
  "hard-edge": { offset: 3, opacity: 1.0, blur: 0 },
  deep: { offset: 6, opacity: 0.6, blur: 12 },
};
const shadowConfig = SHADOW_PROFILES[layoutMap.typographyConfig.shadowProfile];
```

### 3. In Route Handler — Pass LayoutMap
```typescript
composedBuffer = await composeScreenshot(
  rawBuffer,
  androidFrame,
  locale,
  layoutMap,  // NEW
);
```

---

## Schema Selection Logic (Non-AI)

```typescript
// In mood-schema.ts
export function selectMoodSchemaForCategory(category: string): MoodSchema {
  // Returns best matching schema for category
  // Uses categoryAffinities array in each schema
  // Falls back to "energetic-tech" if no match
}
```

No Gemini call needed for initial selection. It's a deterministic lookup.

---

## Key Takeaway

> **Gemini is a SELECTOR, not a CREATOR**
> 
> ✅ Gemini CAN: Pick one of 5 schemas, decide text position, compose description
> ❌ Gemini CANNOT: Invent colors, create fonts, make up shadow profiles
>
> This removes hallucination risk and ensures consistency.

---
