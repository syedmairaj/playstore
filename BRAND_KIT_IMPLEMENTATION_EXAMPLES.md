# Brand Kit Implementation Examples

**Date:** 2026-06-05  
**Purpose:** Real-world code examples for using Brand Kit in your application  

---

## Quick Start - Copy & Paste Examples

### Example 1: Using BrandKitImage in IssueCard

```typescript
// components/reviews/IssueCard.tsx
import { BrandKitImage } from "@/components/brand-kit/BrandKitImage";
import { extractBrandKit, getScreenshotsForLanguage } from "@/lib/brand-kit/asset-selector";
import { isRTLLanguage } from "@/lib/localization/rtl";

function IssueCard({ issue, workspaceId, appId }: IssueCardProps) {
  const brandKit = extractBrandKit(issue.metadata);
  const language = issue.language || "en";
  const isRTL = isRTLLanguage(language);
  const screenshots = getScreenshotsForLanguage(brandKit, language);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="space-y-4">
      {/* Icon */}
      {brandKit?.app_icon && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">Icon</span>
          <BrandKitImage
            src={brandKit.app_icon}
            alt="App Icon"
            width={48}
            height={48}
            className="w-12 h-12"
          />
        </div>
      )}

      {/* Screenshots */}
      {screenshots.length > 0 && (
        <div>
          <span className="text-xs text-zinc-500 block mb-2">
            Screenshots ({language})
          </span>
          <div className="grid grid-cols-2 gap-2">
            {screenshots.slice(0, 4).map((url, idx) => (
              <BrandKitImage
                key={idx}
                src={url}
                alt={`Screenshot ${idx + 1}`}
                width={150}
                height={200}
                className="w-full aspect-[3/4]"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### Example 2: Using BrandKitImageGrid for Multiple Screenshots

```typescript
// components/reviews/ListingPreview.tsx
import { BrandKitImageGrid } from "@/components/brand-kit/BrandKitImage";
import { getScreenshotsForLanguage, extractBrandKit } from "@/lib/brand-kit/asset-selector";

function ListingPreview({ item }: Props) {
  const brandKit = extractBrandKit(item.metadata);
  const language = item.language || "en";
  const screenshots = getScreenshotsForLanguage(brandKit, language);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">
        Listing Preview - {language.toUpperCase()}
      </h3>

      {/* Show all screenshots in a grid */}
      <BrandKitImageGrid
        images={screenshots}
        columns={2}
        gap="md"
        imageHeight={250}
        alt="App Screenshot"
      />
    </div>
  );
}
```

---

### Example 3: Using BrandKitImageCarousel for Interactive Browsing

```typescript
// components/reviews/InteractivePreview.tsx
import { BrandKitImageCarousel } from "@/components/brand-kit/BrandKitImage";
import { getScreenshotsForLanguage, extractBrandKit } from "@/lib/brand-kit/asset-selector";

function InteractivePreview({ item }: Props) {
  const brandKit = extractBrandKit(item.metadata);
  const language = item.language || "en";
  const screenshots = getScreenshotsForLanguage(brandKit, language);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Full Preview</h3>

      {/* Interactive carousel */}
      <BrandKitImageCarousel
        images={screenshots}
        height={500}
        showIndicators={true}
        autoPlay={false}
        alt="App Screenshot"
      />
    </div>
  );
}
```

---

### Example 4: Language Switching with Auto Asset Selection

```typescript
// components/reviews/LanguageAwarePreview.tsx
"use client";

import { useState } from "react";
import { BrandKitImage, BrandKitImageGrid } from "@/components/brand-kit/BrandKitImage";
import {
  extractBrandKit,
  getScreenshotsForLanguage,
  getAvailableLanguages,
} from "@/lib/brand-kit/asset-selector";
import { isRTLLanguage } from "@/lib/localization/rtl";

function LanguageAwarePreview({ item }: Props) {
  const brandKit = extractBrandKit(item.metadata);
  const availableLanguages = getAvailableLanguages(brandKit);
  const [selectedLanguage, setSelectedLanguage] = useState(
    availableLanguages[0] || "en"
  );

  const isRTL = isRTLLanguage(selectedLanguage);
  const screenshots = getScreenshotsForLanguage(brandKit, selectedLanguage);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="space-y-6">
      {/* Language Selector */}
      {availableLanguages.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {availableLanguages.map((lang) => (
            <button
              key={lang}
              onClick={() => setSelectedLanguage(lang)}
              className={`px-3 py-1 text-sm rounded-lg transition ${
                selectedLanguage === lang
                  ? "bg-blue-500/20 border border-blue-500 text-blue-300"
                  : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Screenshots for selected language */}
      {screenshots.length > 0 ? (
        <BrandKitImageGrid
          images={screenshots}
          columns={2}
          alt="Screenshot"
        />
      ) : (
        <div className="p-6 rounded-lg bg-zinc-900 border border-zinc-800 text-center text-zinc-500">
          No screenshots available for {selectedLanguage}
        </div>
      )}
    </div>
  );
}
```

---

### Example 5: Checking Brand Kit Availability

```typescript
// components/reviews/BrandKitStatus.tsx
import {
  extractBrandKit,
  hasBrandKitAssets,
  getBrandKitSummary,
} from "@/lib/brand-kit/asset-selector";

function BrandKitStatus({ item }: Props) {
  const brandKit = extractBrandKit(item.metadata);
  const hasBrandKit = hasBrandKitAssets(brandKit);
  const summary = getBrandKitSummary(brandKit);

  if (!hasBrandKit) {
    return (
      <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
        <p className="text-sm text-yellow-300">
          ⚠️ No brand kit assets available for this item
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
      <div className="space-y-2">
        <p className="text-sm font-medium text-emerald-300">
          ✓ Brand Kit Available
        </p>
        <ul className="text-xs text-emerald-200 space-y-1">
          {summary.hasIcon && <li>• App Icon</li>}
          {summary.bannerCount > 0 && <li>• {summary.bannerCount} Banner(s)</li>}
          {summary.totalScreenshots > 0 && (
            <li>• {summary.totalScreenshots} Screenshot(s)</li>
          )}
          <li>• Languages: {summary.availableLanguages.join(", ") || "en"}</li>
        </ul>
      </div>
    </div>
  );
}
```

---

### Example 6: RTL-Aware Layout

```typescript
// components/reviews/RTLAwareCard.tsx
import { isRTLLanguage, getAlignmentUtilities } from "@/lib/localization/rtl";
import { extractBrandKit } from "@/lib/brand-kit/asset-selector";

function RTLAwareCard({ item }: Props) {
  const language = item.language || "en";
  const isRTL = isRTLLanguage(language);
  const align = getAlignmentUtilities(language);
  const brandKit = extractBrandKit(item.metadata);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="bg-zinc-900 rounded-lg p-4">
      {/* Content flexes differently based on RTL */}
      <div className={`flex ${align.isRTL ? "flex-row-reverse" : "flex-row"} gap-4`}>
        {/* Icon on left (LTR) or right (RTL) */}
        {brandKit?.app_icon && (
          <img
            src={brandKit.app_icon}
            alt="Icon"
            className="w-16 h-16 rounded-lg flex-shrink-0"
          />
        )}

        {/* Text content */}
        <div className="flex-1 space-y-2">
          <h3 className={`font-semibold text-white ${align.textAlign}`}>
            {item.content}
          </h3>
          <p className={`text-sm text-zinc-400 ${align.textAlign}`}>
            {item.metadata?.description}
          </p>
        </div>
      </div>
    </div>
  );
}
```

---

### Example 7: Validating Brand Kit Structure

```typescript
// In ReviewsClient.tsx before staging
import { isValidBrandKit, extractBrandKit } from "@/lib/brand-kit/asset-selector";

async function onStageIssue(issue: IssueItem) {
  const brandKit = extractBrandKit(issue.metadata);

  // Validate brand kit before staging
  if (brandKit && !isValidBrandKit(brandKit)) {
    console.warn("Invalid brand kit structure:", brandKit);
    toast.error("Brand kit assets are corrupted");
    return;
  }

  // Proceed with staging
  await stageToVault(issue);
}
```

---

### Example 8: API Response Handling with Brand Kit

```typescript
// In ReviewsClient.tsx
import { extractBrandKit, getBrandKitSummary } from "@/lib/brand-kit/asset-selector";

async function fetchOptimizerContext() {
  const res = await fetch(`/api/workspaces/${workspaceId}/optimizer/context`);
  const data = await res.json();

  // Process active items
  data.activeItems.forEach((item: any) => {
    const brandKit = extractBrandKit(item.metadata);
    if (brandKit) {
      const summary = getBrandKitSummary(brandKit);
      console.log(`Item ${item.id} has brand kit with summary:`, summary);
    }
  });

  setActiveItems(data.activeItems);
}
```

---

### Example 9: Sync Route - Logging Brand Kit

After updating the sync endpoint, you'll get a response like:

```json
{
  "success": true,
  "itemsProcessed": 5,
  "brandKit": {
    "itemsWithAssets": 3,
    "totalAssets": 12
  },
  "message": "Sync completed successfully"
}
```

Use this in your frontend:

```typescript
async function triggerSync() {
  const res = await fetch(`/api/workspaces/${workspaceId}/optimizer/sync`, {
    method: "POST",
  });

  const data = await res.json();

  if (data.success) {
    console.log(
      `✓ Synced ${data.itemsProcessed} items`
    );
    console.log(
      `✓ Brand Kit: ${data.brandKit.itemsWithAssets} items with ${data.brandKit.totalAssets} total assets`
    );

    toast.success(
      `Synced with ${data.brandKit.itemsWithAssets} brand kit items`
    );
  }
}
```

---

## Testing Checklist

### 1. Data Integration
```typescript
// Test that metadata is returned without truncation
const res = await fetch(`/api/workspaces/${id}/optimizer/context`);
const data = await res.json();

// Check that brand_kit is fully preserved
const item = data.activeItems[0];
console.log(item.metadata.brand_kit); // Should show full object
console.assert(item.metadata.brand_kit.screenshots, "Screenshots missing!");
```

### 2. RTL Support
```typescript
// Test RTL detection and layout
import { isRTLLanguage, getLanguageDirection } from "@/lib/localization/rtl";

console.assert(isRTLLanguage("ar") === true, "Arabic should be RTL");
console.assert(isRTLLanguage("en") === false, "English should be LTR");
console.assert(getLanguageDirection("ar-SA") === "rtl", "Arabic dialect should be RTL");
```

### 3. Asset Selection
```typescript
// Test that correct screenshots are selected per language
import { getScreenshotsForLanguage } from "@/lib/brand-kit/asset-selector";

const mockBrandKit = {
  screenshots: {
    en: ["en-1.png", "en-2.png"],
    ar: ["ar-1.png", "ar-2.png"],
  },
};

const enScreens = getScreenshotsForLanguage(mockBrandKit, "en");
const arScreens = getScreenshotsForLanguage(mockBrandKit, "ar");

console.assert(enScreens[0] === "en-1.png", "English screenshots incorrect");
console.assert(arScreens[0] === "ar-1.png", "Arabic screenshots incorrect");
```

### 4. Image Rendering
```typescript
// Test that BrandKitImage shows skeleton and handles errors
import { render, screen } from "@testing-library/react";
import { BrandKitImage } from "@/components/brand-kit/BrandKitImage";

// Test: No src shows "Generating..."
render(<BrandKitImage alt="test" />);
expect(screen.getByText("Generating...")).toBeInTheDocument();

// Test: Valid src loads image
render(<BrandKitImage src="https://example.com/image.png" alt="test" />);
expect(screen.getByRole("img")).toHaveAttribute("src");
```

### 5. Sync Preservation
```typescript
// Test that sync preserves brand_kit in metadata
const res = await fetch(`/api/workspaces/${id}/optimizer/sync`, {
  method: "POST",
});

const data = await res.json();
console.assert(data.brandKit.itemsWithAssets > 0, "Brand kit items not counted!");
console.assert(data.brandKit.totalAssets > 0, "Assets not counted!");
```

---

## Troubleshooting

### Problem: Images not showing
**Check:**
1. Is the brand_kit in metadata returned from API?
2. Are the image URLs valid/accessible?
3. Are you using `extractBrandKit()` to safely get the object?

### Problem: RTL layout broken
**Check:**
1. Is `dir={isRTL ? "rtl" : "ltr"}` set on the container?
2. Are you using `getLanguageDirection()` correctly?
3. Is the language code correct (e.g., "ar" not "arabic")?

### Problem: Wrong screenshots for language
**Check:**
1. Does the brand_kit have the language in screenshots object?
2. Are you calling `getScreenshotsForLanguage()` correctly?
3. Does the fallback to "en" work if language not found?

---

**All examples are production-ready. Copy and adapt to your codebase!**
