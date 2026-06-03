# Sharp Compositing Integration — Mood Schema Asset Pipeline

**Overview**: Update `composeScreenshot()` to consume `layoutMap.selectedSchema` and `typographyConfig` for deterministic asset selection.

---

## Current composeScreenshot() Signature

**File**: `lib/screenshot/compose-screenshot.ts`

```typescript
export async function composeScreenshot(
  rawBuffer: Buffer,
  androidFrame: Buffer,
  locale: "en" | "ar",
): Promise<Buffer>
```

**Required Change**: Add LayoutMap parameter for schema + typography access

```typescript
export async function composeScreenshot(
  rawBuffer: Buffer,
  androidFrame: Buffer,
  locale: "en" | "ar",
  layoutMap: LayoutMap,  // NEW
): Promise<Buffer>
```

---

## Implementation Roadmap

### Phase 1: Font Asset Loading

**Add to your project**:

1. Create font directory structure:
```
/public/fonts/
├── Inter-Bold.ttf                    # clean fontStyle
├── Poppins-ExtraBold.ttf            # bold fontStyle
├── Lato-SemiBold.ttf                # organic/health fontStyle
├── Montserrat-Black.ttf             # high-contrast fontStyle
└── PlayfairDisplay-Bold.ttf         # luxury fontStyle
```

2. Update composeScreenshot() to map fontStyle → font file:

```typescript
const fontMap: Record<"bold" | "elegant" | "clean", string> = {
  bold: "/public/fonts/Poppins-ExtraBold.ttf",
  elegant: "/public/fonts/PlayfairDisplay-Bold.ttf",
  clean: "/public/fonts/Inter-Bold.ttf",
};

const fontPath = fontMap[layoutMap.typographyConfig.fontStyle];
```

---

### Phase 2: Shadow Profile Rendering

**Shadow Configuration by Profile**:

```typescript
type ShadowProfile = "sharp" | "soft-spread" | "subtle" | "hard-edge" | "deep";

interface ShadowConfig {
  offset: number;        // Pixel offset from text
  opacity: number;       // 0-1 shadow transparency
  blur: number;          // Sigma blur radius
  color: string;         // Hex color (typically #000000 with opacity)
}

const SHADOW_PROFILES: Record<ShadowProfile, ShadowConfig> = {
  sharp: {
    offset: 2,
    opacity: 0.8,
    blur: 0,      // No blur = crisp, defined shadow
    color: "#000000",
  },
  "soft-spread": {
    offset: 4,
    opacity: 0.4,
    blur: 8,      // Soft, diffused shadow
    color: "#000000",
  },
  subtle: {
    offset: 1,
    opacity: 0.3,
    blur: 2,      // Minimal shadow
    color: "#000000",
  },
  "hard-edge": {
    offset: 3,
    opacity: 1.0,
    blur: 0,      // Maximum contrast, no softness
    color: "#000000",
  },
  deep: {
    offset: 6,
    opacity: 0.6,
    blur: 12,     // Deep, pronounced shadow
    color: "#000000",
  },
};

const shadowConfig = SHADOW_PROFILES[layoutMap.typographyConfig.shadowProfile];
```

---

### Phase 3: Text Overlay Generation

**Helper Function**:

```typescript
async function generateTextOverlay(options: {
  text: string;
  color: string;           // From layoutMap.typographyConfig.primaryColor
  fontPath: string;        // From fontMap
  fontSize: number;        // e.g., 48 for headline
  shadowConfig: ShadowConfig;
  width: number;           // Canvas width
  height: number;          // Canvas height
  position: "top" | "center" | "bottom";  // From layoutMap.textPosition
  align: "left" | "right" | "center";    // From RTL logic
}): Promise<Buffer> {
  // Use Jimp or node-canvas for text rendering with shadow
  // 1. Create canvas
  // 2. Render shadow text at (x + offset, y + offset) with blur
  // 3. Render foreground text at (x, y) with primary color
  // 4. Return buffer
}
```

---

### Phase 4: Update composeScreenshot() Logic

**Pseudocode**:

```typescript
export async function composeScreenshot(
  rawBuffer: Buffer,
  androidFrame: Buffer,
  locale: "en" | "ar",
  layoutMap: LayoutMap,  // NEW
): Promise<Buffer> {
  const isRTL = isRTLLocale(locale);
  
  // 1. Load and scale FLUX background
  let image = sharp(rawBuffer).resize(1080, 1920, { fit: "fill", kernel: "lanczos3" });

  // 2. Apply RTL flop if needed
  if (isRTL) {
    image = image.flop();
  }

  // 3. Determine text position (top/center/bottom)
  const textPositionMap = {
    top: 200,
    center: 960,
    bottom: 1700,
  };
  const textY = textPositionMap[layoutMap.textPosition];

  // 4. Load font based on typographyConfig.fontStyle
  const fontMap = {
    bold: "/public/fonts/Poppins-ExtraBold.ttf",
    elegant: "/public/fonts/PlayfairDisplay-Bold.ttf",
    clean: "/public/fonts/Inter-Bold.ttf",
  };
  const fontPath = fontMap[layoutMap.typographyConfig.fontStyle];

  // 5. Get shadow profile
  const shadowConfig = SHADOW_PROFILES[layoutMap.typographyConfig.shadowProfile];

  // 6. Generate text overlays (headline, subline, CTA) with shadows
  const headlineOverlay = await generateTextOverlay({
    text: layoutMap.headline,
    color: layoutMap.typographyConfig.primaryColor,
    fontPath,
    fontSize: 48,
    shadowConfig,
    width: 1080,
    height: 1920,
    position: layoutMap.textPosition,
    align: isRTL ? "right" : "left",
  });

  // 7. Composite text overlay
  image = image.composite([
    {
      input: headlineOverlay,
      left: 0,
      top: 0,
    }
  ]);

  // 8. Composite Android frame
  image = image.composite([
    {
      input: androidFrame,
      left: isRTL ? 0 : 720,  // Frame on LEFT for RTL, RIGHT for LTR
      top: 0,
    }
  ]);

  // 9. Apply RTL flop back if needed
  if (isRTL) {
    image = image.flop();
  }

  // 10. Render to PNG
  return image.png().toBuffer();
}
```

---

### Phase 5: Update Route Handler

**File**: `app/api/screenshot-studio/generate/route.ts`

**Current Call** (line 436):
```typescript
composedBuffer = await composeScreenshot(rawBuffer, androidFrame, locale);
```

**Updated Call**:
```typescript
composedBuffer = await composeScreenshot(
  rawBuffer,
  androidFrame,
  locale,
  layoutMap,  // NEW: pass the LayoutMap with schema + typography
);
```

---

## Validation Examples

### Example 1: Minimalist Professional (Finance App)

**Input**:
```json
{
  "category": "finance",
  "selectedSchema": "minimalist-professional",
  "typographyConfig": {
    "primaryColor": "#1E293B",
    "fontStyle": "clean",
    "shadowProfile": "sharp"
  }
}
```

**Sharp Rendering**:
- Font: Inter-Bold
- Shadow: sharp (offset 2px, no blur, 0.8 opacity)
- Text Color: #1E293B (dark slate)
- Result: Professional, sharp-edged, minimal shadow

---

### Example 2: Energetic Tech (Gaming App with Orange Brand)

**Input**:
```json
{
  "category": "gaming",
  "selectedSchema": "energetic-tech",
  "typographyConfig": {
    "primaryColor": "#EF6820",  // User's orange
    "fontStyle": "bold",
    "shadowProfile": "soft-spread"
  }
}
```

**Sharp Rendering**:
- Font: Poppins-ExtraBold
- Shadow: soft-spread (offset 4px, blur 8px, 0.4 opacity)
- Text Color: #EF6820 (vibrant orange)
- Result: Bold, energetic, diffused glow around text

---

### Example 3: Luxury Premium

**Input**:
```json
{
  "category": "luxury",
  "selectedSchema": "luxury-premium",
  "typographyConfig": {
    "primaryColor": "#78350F",  // Dark metallic brown
    "fontStyle": "elegant",
    "shadowProfile": "deep"
  }
}
```

**Sharp Rendering**:
- Font: PlayfairDisplay-Bold
- Shadow: deep (offset 6px, blur 12px, 0.6 opacity)
- Text Color: #78350F (luxury brown)
- Result: Elegant, sophisticated, pronounced shadow depth

---

## Implementation Checklist

- [ ] Create `/public/fonts/` directory with 5 font files
- [ ] Add `generateTextOverlay()` helper function
- [ ] Add `SHADOW_PROFILES` constant
- [ ] Update `composeScreenshot()` signature
- [ ] Update font loading logic
- [ ] Update shadow rendering logic
- [ ] Update text positioning logic
- [ ] Update route handler call site
- [ ] Test with minimalist-professional schema
- [ ] Test with energetic-tech schema
- [ ] Test with high-contrast-bold schema
- [ ] Test with organic-health schema
- [ ] Test with luxury-premium schema
- [ ] Verify RTL composition works correctly
- [ ] Verify text contrast with layoutMap.textColor

---

## Dependencies

You'll likely need these npm packages (if not already installed):

```bash
npm install sharp jimp                # Image processing
npm install canvas                    # Text rendering alternative
```

Or stick with your existing sharp + Canvas setup and adapt accordingly.

---

## Notes

1. **Font Path Resolution**: Make sure font paths are resolved correctly from your runtime environment. Consider using `path.join(process.cwd(), 'public', 'fonts', ...)` for proper resolution.

2. **Shadow Rendering**: If using sharp for shadows, you may need to pre-render shadows in a separate layer. Alternatively, use Jimp or node-canvas for more flexible text rendering with built-in shadow support.

3. **Color Accessibility**: Ensure `layoutMap.textColor` (contrast color from compositor) + `layoutMap.typographyConfig.primaryColor` (text color) meet WCAG AA standards.

4. **RTL Text Rendering**: For Arabic text, ensure font supports RTL and that text direction is correctly set in your rendering engine.

5. **Performance**: Pre-load fonts at server startup to avoid re-loading on every request:
```typescript
// At server startup
const fonts = new Map();
for (const [style, path] of Object.entries(fontMap)) {
  fonts.set(style, fs.readFileSync(path));
}
```

---
