# Brand Kit Integration Guide - Complete Implementation

**Date:** 2026-06-05  
**Status:** Ready for Implementation  
**Scope:** App Icon, Banners, Screenshots, and RTL Localization  

---

## Overview

The Brand Kit integration ensures that when a staging item contains asset metadata (icon URI, banner URIs, screenshot URIs), these are:
1. ✅ Returned in full without truncation in API responses
2. ✅ Language-aware (RTL layout for Arabic, LTR for English)
3. ✅ Intelligently rendered in UI with skeleton loaders
4. ✅ Preserved through the sync pipeline without corruption

---

## 1. Data Integration - API Response Format

### Current Issue
The `metadata` JSONB field may contain:
```json
{
  "brand_kit": {
    "app_icon": "https://cdn.example.com/icon-1024.png",
    "banners": [
      "https://cdn.example.com/banner-en-1.png",
      "https://cdn.example.com/banner-ar-1.png"
    ],
    "screenshots": {
      "en": [
        "https://cdn.example.com/screenshot-en-1.png",
        "https://cdn.example.com/screenshot-en-2.png"
      ],
      "ar": [
        "https://cdn.example.com/screenshot-ar-1.png",
        "https://cdn.example.com/screenshot-ar-2.png"
      ]
    }
  }
}
```

### Expected API Response

**GET `/api/workspaces/[id]/optimizer/context`**

```json
{
  "success": true,
  "activeItems": [
    {
      "id": "uuid-123",
      "signalType": "review_issue",
      "content": "App crashes on startup",
      "language": "en",
      "stagedAt": "2026-06-05T...",
      "metadata": {
        "description": "Critical crash issue",
        "severity": "critical",
        "brand_kit": {
          "app_icon": "https://cdn.example.com/icon-1024.png",
          "banners": ["https://cdn.example.com/banner-en-1.png"],
          "screenshots": {
            "en": ["https://cdn.example.com/screenshot-en-1.png"],
            "ar": ["https://cdn.example.com/screenshot-ar-1.png"]
          }
        }
      }
    }
  ],
  "stats": { "totalStaged": 1, "totalDeleted": 0, "lastSyncAt": "..." }
}
```

**Key Point:** The entire `metadata` object is returned as-is from the database. No truncation, no filtering. The JSONB field is returned fully intact.

---

## 2. Localization - Language-Aware Asset Routing

### RTL Detection Pattern

```typescript
// lib/localization/rtl.ts
export function isRTLLanguage(language?: string): boolean {
  const rtlLanguages = ["ar", "he", "fa", "ur"];
  return rtlLanguages.includes(language?.toLowerCase() || "");
}

export function getLanguageDirection(language?: string): "rtl" | "ltr" {
  return isRTLLanguage(language) ? "rtl" : "ltr";
}
```

### Asset Selection Logic

```typescript
// lib/brand-kit/asset-selector.ts
import { isRTLLanguage } from "@/lib/localization/rtl";

export interface BrandKit {
  app_icon?: string;
  banners?: string[];
  screenshots?: {
    [language: string]: string[];
  };
}

export function getScreenshotsForLanguage(
  brandKit: BrandKit | undefined,
  language: string
): string[] {
  if (!brandKit?.screenshots) return [];
  
  // Try exact language match first
  if (brandKit.screenshots[language]) {
    return brandKit.screenshots[language];
  }
  
  // Fall back to language base (e.g., "ar-SA" → "ar")
  const langBase = language.split("-")[0];
  if (brandKit.screenshots[langBase]) {
    return brandKit.screenshots[langBase];
  }
  
  // Fall back to English
  if (brandKit.screenshots["en"]) {
    return brandKit.screenshots["en"];
  }
  
  return [];
}

export function getBannerForLanguage(
  brandKit: BrandKit | undefined,
  language: string
): string | undefined {
  if (!brandKit?.banners) return undefined;
  
  // Prefer banners with language suffix
  const langBase = language.split("-")[0];
  const langSuffixBanner = brandKit.banners.find(url =>
    url.includes(`-${langBase}`) || url.includes(`_${langBase}`)
  );
  
  if (langSuffixBanner) return langSuffixBanner;
  
  // Fall back to first banner
  return brandKit.banners[0];
}
```

### Example Usage

```typescript
// Inside ReviewsClient.tsx or ListingPreview.tsx
import { getScreenshotsForLanguage, getBannerForLanguage, isRTLLanguage } from "@/lib/brand-kit/asset-selector";

function ListingPreview({ item, language }: Props) {
  const brandKit = item.metadata?.brand_kit;
  const isRTL = isRTLLanguage(language);
  const screenshots = getScreenshotsForLanguage(brandKit, language);
  const banner = getBannerForLanguage(brandKit, language);
  
  return (
    <div dir={isRTL ? "rtl" : "ltr"}>
      {/* Icon */}
      {brandKit?.app_icon && (
        <img src={brandKit.app_icon} alt="App Icon" className="w-16 h-16 rounded-lg" />
      )}
      
      {/* Banner */}
      {banner && (
        <img src={banner} alt="Banner" className="w-full h-40 object-cover" />
      )}
      
      {/* Screenshots - language-specific */}
      <div className="grid grid-cols-2 gap-2">
        {screenshots.map((url, idx) => (
          <img key={idx} src={url} alt={`Screenshot ${idx + 1}`} className="rounded" />
        ))}
      </div>
    </div>
  );
}
```

---

## 3. UI/UX Pattern - Image Rendering with Skeleton Loader

### Component Pattern

```typescript
// components/brand-kit/BrandKitImage.tsx
"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface BrandKitImageProps {
  src?: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  showSkeleton?: boolean;
}

export function BrandKitImage({
  src,
  alt,
  width = 300,
  height = 400,
  className = "",
  showSkeleton = true,
}: BrandKitImageProps) {
  const [isLoading, setIsLoading] = useState(!!src);
  const [hasError, setHasError] = useState(false);

  // Reset loading state when src changes
  useEffect(() => {
    if (src) {
      setIsLoading(true);
      setHasError(false);
    }
  }, [src]);

  // If no src provided
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-900 rounded-lg ${className}`}
        style={{ width, height }}
      >
        <div className="text-center">
          <div className="animate-pulse">
            <div className="inline-block px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <span className="text-xs text-blue-400">Generating...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If loading
  if (isLoading && showSkeleton) {
    return (
      <div
        className={`animate-pulse bg-gradient-to-r from-zinc-800 via-zinc-700 to-zinc-800 rounded-lg ${className}`}
        style={{ width, height }}
      />
    );
  }

  // If error
  if (hasError) {
    return (
      <div
        className={`flex items-center justify-center bg-red-500/10 border border-red-500/30 rounded-lg ${className}`}
        style={{ width, height }}
      >
        <span className="text-xs text-red-400">Failed to load image</span>
      </div>
    );
  }

  // Render image
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      onLoadingComplete={() => setIsLoading(false)}
      onError={() => {
        setIsLoading(false);
        setHasError(true);
      }}
      className={`rounded-lg object-cover ${className}`}
    />
  );
}
```

### IssueCard Integration

```typescript
// components/reviews/IssueCard.tsx
import { BrandKitImage } from "@/components/brand-kit/BrandKitImage";

function IssueCard({
  issue,
  workspaceId,
  appId,
  added,
  onAdd,
  onArchiveIssue,
  isLoading,
  isStagedToVault,
}: IssueCardProps) {
  const brandKit = issue.metadata?.brand_kit;
  const language = issue.language || "en";

  return (
    <Card className="bg-zinc-950 border-zinc-800">
      {/* Card Header */}
      <div className="p-4 border-b border-zinc-800">
        <h3 className="font-medium text-sm text-white">{issue.title}</h3>
        <p className="text-xs text-zinc-400 mt-1">{issue.description}</p>
      </div>

      {/* Brand Kit Assets */}
      {brandKit && (
        <div className="p-4 space-y-4">
          {/* App Icon */}
          {brandKit.app_icon && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">Icon:</span>
              <BrandKitImage
                src={brandKit.app_icon}
                alt="App Icon"
                width={48}
                height={48}
                className="w-12 h-12"
              />
            </div>
          )}

          {/* Banner Preview */}
          {brandKit.banners && brandKit.banners.length > 0 && (
            <div>
              <span className="text-xs text-zinc-500">Banner:</span>
              <BrandKitImage
                src={brandKit.banners[0]}
                alt="Banner"
                width={100}
                height={40}
                className="w-full h-10 mt-2"
              />
            </div>
          )}

          {/* Screenshots */}
          {brandKit.screenshots && (
            <div>
              <span className="text-xs text-zinc-500 block mb-2">
                Screenshots ({language.toUpperCase()}):
              </span>
              <div className="grid grid-cols-2 gap-2">
                {getScreenshotsForLanguage(brandKit, language)
                  .slice(0, 2)
                  .map((url, idx) => (
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
      )}

      {/* Footer with Actions */}
      <div className="p-4 border-t border-zinc-800">
        {isStagedToVault ? (
          <button disabled className="w-full py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium">
            ✓ Staged
          </button>
        ) : (
          <button
            onClick={async () => {
              await fetch(`/api/workspaces/${workspaceId}/staging/add`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  signalType: "review_issue",
                  content: issue.title,
                  source: "review_analysis",
                  sourceAppId: appId,
                  metadata: issue.metadata,
                }),
              });
              await onArchiveIssue?.(issue.title, issue);
            }}
            disabled={isLoading}
            className="w-full py-2 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-medium hover:bg-blue-500/15 transition"
          >
            {isLoading ? "Staging..." : "Stage Issue"}
          </button>
        )}
      </div>
    </Card>
  );
}
```

---

## 4. Sync Support - JSONB Metadata Preservation

### Enhanced Sync Route

The `POST /optimizer/sync` endpoint must preserve the complete `metadata` JSONB field. Here's the pattern:

```typescript
// In POST /optimizer/sync endpoint
for (const item of items) {
  try {
    // Validate required fields
    if (!item.id || !item.signal_type || !item.content) {
      processErrors.push({
        itemId: item.id || "unknown",
        error: "Missing required fields",
      });
      continue;
    }

    // ✅ KEY: Preserve entire metadata object, including brand_kit
    const metadata = item.metadata || {};
    const brandKit = metadata.brand_kit;

    // Log with brand kit info
    if (brandKit) {
      console.debug(
        `[${ROUTE}] Processing item ${item.id} with brand_kit: ${
          Object.keys(brandKit).length
        } assets`
      );
    }

    // ✅ Do NOT stringify/parse/modify metadata - pass through as-is
    console.debug(
      `[${ROUTE}] Processing item ${item.id}: ${item.signal_type} - "${item.content.substring(0, 50)}..." (lang: ${item.language || "en"})`
    );

    processedCount++;
  } catch (itemError) {
    processErrors.push({
      itemId: item.id,
      error: itemError instanceof Error ? itemError.message : String(itemError),
    });
    console.error(`[${ROUTE}] Error processing item ${item.id}:`, itemError);
  }
}
```

### What NOT to Do
❌ **Don't stringify metadata:** `JSON.stringify(item.metadata)`  
❌ **Don't pick specific keys:** `{ severity: metadata.severity }`  
❌ **Don't re-parse:** `JSON.parse(item.metadata)`  

### What to Do
✅ **Pass through as-is:** `metadata: item.metadata || {}`  
✅ **Log for debugging:** Include brand_kit asset count in logs  
✅ **Preserve structure:** JSONB from DB → Response object (no manipulation)  

---

## Implementation Checklist

### Backend (API)
- [ ] ✅ `context/route.ts` returns full `metadata` without truncation
- [ ] ✅ `sync/route.ts` preserves metadata JSONB without modification
- [ ] [ ] Add logging to track brand_kit assets processed
- [ ] [ ] Test with actual asset URIs in metadata

### Library Functions
- [ ] [ ] Create `lib/localization/rtl.ts` with `isRTLLanguage()`, `getLanguageDirection()`
- [ ] [ ] Create `lib/brand-kit/asset-selector.ts` with `getScreenshotsForLanguage()`, `getBannerForLanguage()`
- [ ] [ ] Write unit tests for language-based asset selection

### Frontend Components
- [ ] [ ] Create `components/brand-kit/BrandKitImage.tsx` with skeleton loader
- [ ] [ ] Update `components/reviews/IssueCard.tsx` to render brand kit assets
- [ ] [ ] Test RTL/LTR rendering with Arabic and English screenshots
- [ ] [ ] Test image loading states and error handling

### Testing
- [ ] [ ] Stage an issue with full brand_kit metadata
- [ ] [ ] Verify API returns complete metadata without truncation
- [ ] [ ] Test asset selection for Arabic language
- [ ] [ ] Test RTL layout direction
- [ ] [ ] Verify skeleton loader shows when image missing
- [ ] [ ] Test image load error handling

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Stage Issue with Brand Kit Metadata                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │ POST /staging/add             │
        │ (stage with full metadata)    │
        └──────────────────┬────────────┘
                           │
                           ▼
        ┌──────────────────────────────┐
        │ workspace_staging_vault       │
        │ metadata JSONB column:        │
        │ {                            │
        │   brand_kit: { ... },        │
        │   severity: "critical"       │
        │ }                            │
        └──────────────────┬────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
┌─────────────────────────┐       ┌──────────────────────────┐
│ GET /optimizer/context  │       │ POST /optimizer/sync     │
│ Returns full metadata   │       │ Preserves metadata       │
│ (no truncation)         │       │ (JSONB → JSONB)         │
└──────────────┬──────────┘       └──────────────┬───────────┘
               │                                  │
               ▼                                  ▼
    ┌────────────────────┐           ┌──────────────────────┐
    │ Frontend receives  │           │ No corruption of     │
    │ activeItems with   │           │ brand_kit assets     │
    │ brand_kit URIs     │           │ in sync pipeline     │
    └────────────┬───────┘           └──────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
    ┌────────┐       ┌────────┐
    │ isRTL? │       │ Assets │
    │        │       │ exist? │
    └────┬───┘       └────┬───┘
         │                │
      ▼──┴──▼          ▼──┴──▼
    RTL    LTR      Show     Skeleton
    Layout Layout   Image    Loader
```

---

## Example Metadata Structure

```json
{
  "metadata": {
    "description": "App crashes on startup",
    "severity": "critical",
    "impactPercent": 45,
    "brand_kit": {
      "app_icon": "https://cdn.example.com/apps/app123/icon-1024.png",
      "banners": [
        "https://cdn.example.com/apps/app123/banner-en-1.png",
        "https://cdn.example.com/apps/app123/banner-ar-1.png"
      ],
      "screenshots": {
        "en": [
          "https://cdn.example.com/apps/app123/screenshot-en-1.png",
          "https://cdn.example.com/apps/app123/screenshot-en-2.png",
          "https://cdn.example.com/apps/app123/screenshot-en-3.png"
        ],
        "ar": [
          "https://cdn.example.com/apps/app123/screenshot-ar-1.png",
          "https://cdn.example.com/apps/app123/screenshot-ar-2.png",
          "https://cdn.example.com/apps/app123/screenshot-ar-3.png"
        ]
      }
    }
  }
}
```

---

## Quick Start

1. **Copy the utility functions** from this guide into:
   - `lib/localization/rtl.ts`
   - `lib/brand-kit/asset-selector.ts`

2. **Create the image component:**
   - `components/brand-kit/BrandKitImage.tsx`

3. **Update IssueCard:**
   - Import `BrandKitImage` and `getScreenshotsForLanguage`
   - Add brand kit asset rendering section

4. **Test with real data:**
   - Stage an issue with `brand_kit` in metadata
   - Verify API returns full metadata
   - Check RTL rendering for Arabic language

---

**Status:** Ready for implementation  
**Next:** Create the library files and test with real brand kit data
