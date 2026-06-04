# Frontend Refactor Guide: Staging Vault Migration

**Status:** Ready for Implementation  
**Date:** June 4, 2026

---

## Overview

This guide shows exact refactors to replace legacy navigation-based buttons with the new `StageButton` component. The pattern: instead of `router.push()`, call the staging API, show a toast, and stay on the current page.

**Key Benefits:**
- ✅ No page navigation (better UX)
- ✅ Signals persist in DB immediately
- ✅ Signals available to optimizer without refresh
- ✅ Full RTL support for Arabic
- ✅ Uniform toast notifications

---

## 1. StageButton Component Overview

### Simple Example

```typescript
import { StageButton } from "@/components/staging/StageButton";

<StageButton
  signalType="review_issue"
  content="App crashes on iOS 12"
  source="review_analysis"
  workspaceId="ws-123"
  sourceAppId="app-456"
  metadata={{ reviewScore: 2.1, issueCount: 5 }}
/>
```

### With Callbacks

```typescript
<StageButton
  signalType="competitor_weakness"
  content="No dark mode option"
  source="competitor_spy"
  workspaceId={workspaceId}
  sourceAppId={appId}
  label="Add to Optimizer"
  variant="secondary"
  size="sm"
  onStaged={() => {
    // Mark as staged, refresh UI, etc
    refreshCompetitorsList();
  }}
/>
```

### Props Reference

| Prop | Type | Required | Default | Notes |
|------|------|----------|---------|-------|
| `signalType` | `"keyword" \| "review_issue" \| "competitor_weakness" \| "optimization_insight"` | ✅ | — | Signal category |
| `content` | string | ✅ | — | What to stage (can be Arabic) |
| `source` | `"keyword_spotlight" \| "keyword_tracker" \| "review_analysis" \| "competitor_spy" \| "manual" \| "api"` | ✅ | — | Where it came from |
| `workspaceId` | string | ✅ | — | Target workspace |
| `sourceAppId` | string | ✅ | — | Which app this is for |
| `metadata` | object | ❌ | `{}` | Extra context (rank, score, etc) |
| `language` | string | ❌ | `locale` from `next-intl` | Force language (e.g., "ar") |
| `onStaged` | function | ❌ | — | Callback when staged |
| `className` | string | ❌ | `""` | Additional CSS classes |
| `variant` | `"primary" \| "secondary" \| "ghost"` | ❌ | `"primary"` | Button style |
| `size` | `"sm" \| "md" \| "lg"` | ❌ | `"md"` | Button size |
| `label` | string | ❌ | Auto-generated | Override button text |

---

## 2. Page Refactors

### A. Reviews Page Refactor

**Old Pattern (Navigation):**

```typescript
// ❌ BEFORE: Pages > Reviews.tsx
export function ReviewsPage() {
  const router = useRouter();
  const { workspaceId, appId } = useParams();

  const handleAddToBacklog = (issue: ReviewIssue) => {
    // Navigate away - user loses context
    router.push(`/optimizer?issue=${issue.id}&tab=backlog`);
  };

  return (
    <div>
      {issues.map((issue) => (
        <div key={issue.id} className="review-item">
          <p>{issue.description}</p>
          <button onClick={() => handleAddToBacklog(issue)}>
            Add to Optimization Backlog
          </button>
        </div>
      ))}
    </div>
  );
}
```

**New Pattern (Staging):**

```typescript
// ✅ AFTER: app/workspace/[id]/app/[appId]/reviews/page.tsx
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { StageButton } from "@/components/staging/StageButton";
import type { ReviewIssue } from "@/types/reviews";

export function ReviewsPage() {
  const { id: workspaceId, appId } = useParams() as {
    id: string;
    appId: string;
  };
  const locale = useLocale();
  const [stagedIssues, setStagedIssues] = useState<Set<string>>(new Set());

  return (
    <div dir={locale.startsWith("ar") ? "rtl" : "ltr"} lang={locale}>
      <h1>{locale.startsWith("ar") ? "المراجعات" : "Reviews"}</h1>

      {issues.map((issue) => (
        <div
          key={issue.id}
          className="border rounded-lg p-4 mb-4"
          dir={issue.language === "ar" ? "rtl" : "ltr"}
        >
          <h3 className="font-semibold mb-2">{issue.description}</h3>
          <p className="text-sm text-gray-600 mb-3">
            {locale.startsWith("ar")
              ? `التقييم: ${issue.rating.toFixed(1)}`
              : `Rating: ${issue.rating.toFixed(1)}`}
          </p>

          <StageButton
            signalType="review_issue"
            content={issue.description}
            source="review_analysis"
            workspaceId={workspaceId}
            sourceAppId={appId}
            language={issue.language || locale}
            metadata={{
              rating: issue.rating,
              issueCategory: issue.category,
              userCount: issue.userCount,
              dateDetected: issue.dateDetected,
            }}
            onStaged={() => {
              // Mark this issue as staged
              setStagedIssues((prev) => new Set(prev).add(issue.id));
            }}
            className={stagedIssues.has(issue.id) ? "opacity-50" : ""}
            label={
              stagedIssues.has(issue.id)
                ? locale.startsWith("ar")
                  ? "✓ تمت الإضافة"
                  : "✓ Staged"
                : undefined
            }
          />
        </div>
      ))}
    </div>
  );
}
```

**Key Changes:**
1. ❌ Removed `router.push()` navigation
2. ✅ Added `<StageButton />` with review metadata
3. ✅ Track `stagedIssues` to show checkmark
4. ✅ Respect `issue.language` (might be Arabic)
5. ✅ Use `next-intl` locale for UI labels

---

### B. Competitor Spy Page Refactor

**Old Pattern:**

```typescript
// ❌ BEFORE: Pages > CompetitorSpy.tsx
export function CompetitorSpyPage() {
  const router = useRouter();
  const { workspaceId, appId } = useParams();

  const handleStageExploit = (weakness: CompetitorWeakness) => {
    // Navigate away - loses context
    router.push(`/optimizer?competitor=${weakness.competitorId}&exploit=${weakness.id}`);
  };

  return (
    <div>
      {weaknesses.map((w) => (
        <div key={w.id}>
          <p>{w.title}</p>
          <button onClick={() => handleStageExploit(w)}>
            Stage Competitor Exploit
          </button>
        </div>
      ))}
    </div>
  );
}
```

**New Pattern:**

```typescript
// ✅ AFTER: app/workspace/[id]/app/[appId]/competitor-spy/page.tsx
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { StageButton } from "@/components/staging/StageButton";
import type { CompetitorWeakness } from "@/types/competitors";

export function CompetitorSpyPage() {
  const { id: workspaceId, appId } = useParams() as {
    id: string;
    appId: string;
  };
  const locale = useLocale();
  const [stagedWeaknesses, setStagedWeaknesses] = useState<Set<string>>(
    new Set()
  );

  return (
    <div dir={locale.startsWith("ar") ? "rtl" : "ltr"} lang={locale}>
      <h1>{locale.startsWith("ar") ? "تحليل المنافسين" : "Competitor Analysis"}</h1>

      {weaknesses.map((weakness) => (
        <div key={weakness.id} className="competitor-card border rounded p-4 mb-4">
          <h3 className="font-semibold mb-2">{weakness.title}</h3>
          <p className="text-sm text-gray-600 mb-2">{weakness.description}</p>

          {/* Competitor Info */}
          <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
            <span>
              {locale.startsWith("ar") ? "المنافس" : "Competitor"}:{" "}
              {weakness.competitorName}
            </span>
            <span>•</span>
            <span>
              {locale.startsWith("ar") ? "الأثر" : "Impact"}:{" "}
              {weakness.impactScore}/10
            </span>
          </div>

          {/* Stage Button */}
          <StageButton
            signalType="competitor_weakness"
            content={weakness.description}
            source="competitor_spy"
            workspaceId={workspaceId}
            sourceAppId={appId}
            language={weakness.language || locale}
            metadata={{
              competitorId: weakness.competitorId,
              competitorName: weakness.competitorName,
              impactScore: weakness.impactScore,
              marketShare: weakness.marketShare,
              category: weakness.category,
            }}
            onStaged={() => {
              setStagedWeaknesses(
                (prev) => new Set(prev).add(weakness.id)
              );
            }}
            variant={stagedWeaknesses.has(weakness.id) ? "secondary" : "primary"}
            label={
              stagedWeaknesses.has(weakness.id)
                ? locale.startsWith("ar")
                  ? "✓ تمت الإضافة"
                  : "✓ Staged"
                : locale.startsWith("ar")
                  ? "إضافة إلى محسّن"
                  : "Stage Exploit"
            }
          />
        </div>
      ))}
    </div>
  );
}
```

**Key Changes:**
1. ❌ Removed `router.push()` for navigation
2. ✅ Added `<StageButton />` with competitor metadata
3. ✅ Track staged weaknesses, change button variant/label
4. ✅ Support Arabic competitor names (`weakness.language`)
5. ✅ Show competitor info in metadata for context

---

### C. Market Intelligence Page Refactor

**Old Pattern:**

```typescript
// ❌ BEFORE: Pages > MarketIntel.tsx
export function MarketIntelPage() {
  const router = useRouter();
  const { workspaceId, appId } = useParams();

  const handleOptimizeWithSpotlight = (spotlight: MarketSpotlight) => {
    // Navigate away - context lost
    router.push(`/optimizer?spotlight=${spotlight.id}&market=${spotlight.market}`);
  };

  return (
    <div>
      {spotlights.map((s) => (
        <div key={s.id}>
          <p>{s.keyword}</p>
          <button onClick={() => handleOptimizeWithSpotlight(s)}>
            Optimize Listing with Market Spotlight
          </button>
        </div>
      ))}
    </div>
  );
}
```

**New Pattern:**

```typescript
// ✅ AFTER: app/workspace/[id]/app/[appId]/market-intelligence/page.tsx
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { StageButton } from "@/components/staging/StageButton";
import type { MarketSpotlight } from "@/types/market-intel";

export function MarketIntelPage() {
  const { id: workspaceId, appId } = useParams() as {
    id: string;
    appId: string;
  };
  const locale = useLocale();
  const [stagedKeywords, setStagedKeywords] = useState<Set<string>>(new Set());

  return (
    <div dir={locale.startsWith("ar") ? "rtl" : "ltr"} lang={locale}>
      <h1>{locale.startsWith("ar") ? "ذكاء السوق" : "Market Intelligence"}</h1>

      {spotlights.map((spotlight) => (
        <div key={spotlight.id} className="spotlight-card border rounded p-4 mb-4">
          {/* Keyword Display (RTL if Arabic) */}
          <h3
            className="font-semibold text-lg mb-2"
            dir={spotlight.language === "ar" ? "rtl" : "ltr"}
          >
            {spotlight.keyword}
          </h3>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
            <div className="bg-blue-50 p-2 rounded">
              <p className="text-gray-600">
                {locale.startsWith("ar") ? "حجم البحث" : "Search Volume"}
              </p>
              <p className="font-bold text-lg">
                {spotlight.searchVolume.toLocaleString()}
              </p>
            </div>
            <div className="bg-green-50 p-2 rounded">
              <p className="text-gray-600">
                {locale.startsWith("ar") ? "الصعوبة" : "Difficulty"}
              </p>
              <p className="font-bold text-lg">{spotlight.difficulty}</p>
            </div>
            <div className="bg-yellow-50 p-2 rounded">
              <p className="text-gray-600">
                {locale.startsWith("ar") ? "الاتجاه" : "Trend"}
              </p>
              <p className="font-bold">{spotlight.trend}</p>
            </div>
            <div className="bg-purple-50 p-2 rounded">
              <p className="text-gray-600">
                {locale.startsWith("ar") ? "السوق" : "Market"}
              </p>
              <p className="font-bold">{spotlight.market}</p>
            </div>
          </div>

          {/* Stage Button */}
          <StageButton
            signalType="keyword"
            content={spotlight.keyword}
            source="keyword_spotlight"
            workspaceId={workspaceId}
            sourceAppId={appId}
            language={spotlight.language || locale}
            metadata={{
              searchVolume: spotlight.searchVolume,
              difficulty: spotlight.difficulty,
              trend: spotlight.trend,
              market: spotlight.market,
              countryCode: spotlight.countryCode,
              competitionLevel: spotlight.competitionLevel,
            }}
            onStaged={() => {
              setStagedKeywords((prev) => new Set(prev).add(spotlight.id));
            }}
            size="lg"
            variant={stagedKeywords.has(spotlight.id) ? "secondary" : "primary"}
            label={
              stagedKeywords.has(spotlight.id)
                ? locale.startsWith("ar")
                  ? "✓ تمت الإضافة"
                  : "✓ Staged"
                : locale.startsWith("ar")
                  ? "إضافة إلى المحسّن"
                  : "Stage Keyword"
            }
          />
        </div>
      ))}
    </div>
  );
}
```

**Key Changes:**
1. ❌ Removed `router.push()` navigation
2. ✅ Added `<StageButton />` with keyword metrics (volume, difficulty, trend)
3. ✅ Support Arabic keywords with `dir="rtl"`
4. ✅ Show keyword metrics before staging
5. ✅ Track staged keywords, disable/change button
6. ✅ Full localization for labels

---

## 3. AI Listing Optimizer Page Refactor

The optimizer page now fetches staged signals automatically on mount and merges them with existing UI context.

```typescript
// ✅ app/workspace/[id]/app/[appId]/optimizer/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { StagingVaultPreview } from "@/components/staging/StagingVaultPreview";
import type { AppVaultContext } from "@/lib/staging-vault/staging-vault-service";

export function OptimizerPage() {
  const { id: workspaceId, appId } = useParams() as {
    id: string;
    appId: string;
  };
  const locale = useLocale();
  const [vault, setVault] = useState<AppVaultContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch vault signals on mount
  useEffect(() => {
    const fetchVaultSignals = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/workspaces/${workspaceId}/staging/list?appId=${appId}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch vault: ${response.status}`);
        }

        const data: AppVaultContext = await response.json();
        setVault(data);
        setError(null);
      } catch (err) {
        console.error("[Optimizer] Vault fetch error:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load staged signals"
        );
        // Don't block UI - continue with empty vault
        setVault({
          keywords: [],
          reviewIssues: [],
          competitorWeaknesses: [],
          optimizationInsights: [],
          total: 0,
          lastUpdated: new Date().toISOString(),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchVaultSignals();

    // Optional: Refresh vault every 30 seconds if user switches tabs/pages and comes back
    const interval = setInterval(fetchVaultSignals, 30000);
    return () => clearInterval(interval);
  }, [workspaceId, appId]);

  if (loading) {
    return (
      <div dir={locale.startsWith("ar") ? "rtl" : "ltr"} lang={locale}>
        <h1>{locale.startsWith("ar") ? "جاري التحميل..." : "Loading..."}</h1>
      </div>
    );
  }

  return (
    <div dir={locale.startsWith("ar") ? "rtl" : "ltr"} lang={locale}>
      <div className="flex gap-6">
        {/* Left: Main Optimizer UI */}
        <div className="flex-1">
          <h1 className="text-3xl font-bold mb-6">
            {locale.startsWith("ar") ? "محسّن الإدراج" : "AI Listing Optimizer"}
          </h1>

          {error && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6">
              <p className="text-sm text-yellow-700">{error}</p>
            </div>
          )}

          {/* Vault Summary Section */}
          {vault && vault.total > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">
                {locale.startsWith("ar")
                  ? "الإشارات المرحلية"
                  : "Staged Signals"}
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {vault.keywords.length > 0 && (
                  <div className="bg-white rounded p-4">
                    <p className="text-sm text-gray-600">
                      {locale.startsWith("ar") ? "الكلمات المفتاحية" : "Keywords"}
                    </p>
                    <p className="text-2xl font-bold text-blue-600">
                      {vault.keywords.length}
                    </p>
                  </div>
                )}

                {vault.reviewIssues.length > 0 && (
                  <div className="bg-white rounded p-4">
                    <p className="text-sm text-gray-600">
                      {locale.startsWith("ar") ? "المشاكل" : "Issues"}
                    </p>
                    <p className="text-2xl font-bold text-red-600">
                      {vault.reviewIssues.length}
                    </p>
                  </div>
                )}

                {vault.competitorWeaknesses.length > 0 && (
                  <div className="bg-white rounded p-4">
                    <p className="text-sm text-gray-600">
                      {locale.startsWith("ar")
                        ? "نقاط الضعف"
                        : "Competitor Gaps"}
                    </p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {vault.competitorWeaknesses.length}
                    </p>
                  </div>
                )}

                {vault.optimizationInsights.length > 0 && (
                  <div className="bg-white rounded p-4">
                    <p className="text-sm text-gray-600">
                      {locale.startsWith("ar") ? "الأفكار" : "Insights"}
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {vault.optimizationInsights.length}
                    </p>
                  </div>
                )}
              </div>

              {/* Use Vault as Constraints */}
              <div className="space-y-4">
                {vault.keywords.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">
                      {locale.startsWith("ar") ? "الكلمات المفتاحية المرحلية" : "Staged Keywords"}
                    </h3>
                    <ul className="flex flex-wrap gap-2">
                      {vault.keywords.map((kw) => (
                        <li
                          key={kw.id}
                          className="bg-white px-3 py-1 rounded text-sm border border-blue-200"
                          dir={kw.is_rtl ? "rtl" : "ltr"}
                          lang={kw.language}
                        >
                          "{kw.content}"
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {vault.reviewIssues.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">
                      {locale.startsWith("ar") ? "مشاكل المستخدمين" : "User Issues to Address"}
                    </h3>
                    <ul className="space-y-2">
                      {vault.reviewIssues.map((issue) => (
                        <li
                          key={issue.id}
                          className="bg-white px-3 py-2 rounded text-sm border border-red-200"
                          dir={issue.is_rtl ? "rtl" : "ltr"}
                          lang={issue.language}
                        >
                          {issue.content}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Existing Optimizer UI */}
          <div>
            {/* Your existing optimizer form/UI here */}
            <p>{locale.startsWith("ar") ? "محتوى المحسّن" : "Optimizer content here"}</p>
          </div>
        </div>

        {/* Right: Vault Preview Widget */}
        <div className="w-96">
          <StagingVaultPreview
            workspaceId={workspaceId}
            appId={appId}
            onGenerateClick={() => {
              // Trigger generation with vault signals as mandatory constraints
              console.log("Generate with vault signals:", vault);
            }}
          />
        </div>
      </div>
    </div>
  );
}
```

### What This Does:

1. **On Mount:** Fetches vault signals via `GET /api/workspaces/{id}/staging/list`
2. **Merge Context:** Displays keywords, issues, weaknesses as constraints in the UI
3. **No Refresh:** Optimizer loads immediately with vault data (signals appear instantly)
4. **Auto-Refresh:** Polls vault every 30s if user leaves and returns
5. **RTL Support:** Each signal's `is_rtl` determines text direction
6. **Error Resilient:** Falls back to empty vault if API fails (doesn't block generation)

---

## 4. RTL/LTR Localization Patterns

### Pattern A: Content with Auto-Detection

```typescript
// Content from database has is_rtl flag
<div dir={signal.is_rtl ? "rtl" : "ltr"} lang={signal.language}>
  {signal.content}
</div>

// Works for:
// - "dark mode app" (LTR, English)
// - "تطبيق الوضع الداكن" (RTL, Arabic)
```

### Pattern B: Props with Language Code

```typescript
// When staging, pass language code
<StageButton
  signalType="review_issue"
  content="التطبيق بطيء جداً"  // Arabic text
  language="ar"                 // Force Arabic
  source="review_analysis"
  workspaceId={workspaceId}
  sourceAppId={appId}
/>

// StageButton auto-sets:
// - isRtl = true (because language = "ar")
// - directionality = "rtl"
// - Toast displays in Arabic
```

### Pattern C: Locale-Based Fallback

```typescript
// Use next-intl to get current locale
import { useLocale } from "next-intl";

const locale = useLocale(); // "ar", "en", "fr", etc

<StageButton
  signalType="keyword"
  content={keyword}
  // No language prop → uses locale automatically
  source="keyword_spotlight"
  workspaceId={workspaceId}
  sourceAppId={appId}
/>

// If locale = "ar":
//   - Button label: "إضافة إلى الخزنة" (Arabic)
//   - Toast: "تم الإضافة بنجاح" (Arabic)
//   - Button dir: "rtl"
```

### Pattern D: Mixed Content (Arabic + English)

```typescript
// If content is mixed, auto-detect or force language
<div
  dir={language.startsWith("ar") ? "rtl" : "ltr"}
  className="space-y-2"
>
  {/* English keywords */}
  <div dir="ltr" lang="en">Dark mode</div>

  {/* Arabic keywords */}
  <div dir="rtl" lang="ar">الوضع الداكن</div>
</div>
```

---

## 5. Complete Example: Integrating All 3 Pages

### Step 1: Install Toast to Layout

```typescript
// app/layout.tsx (or root layout)
import { ToastContainer } from "@/components/Toast";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body>
        {children}
        <ToastContainer /> {/* Add here */}
      </body>
    </html>
  );
}
```

### Step 2: Add Components to Each Page

**Reviews Page:**
```bash
# app/workspace/[id]/app/[appId]/reviews/page.tsx
→ Copy from "B. Competitor Spy Page Refactor" above
→ Replace button logic with StageButton
```

**Competitor Spy Page:**
```bash
# app/workspace/[id]/app/[appId]/competitor-spy/page.tsx
→ Copy from "C. Market Intelligence Page Refactor" above
→ Replace button logic with StageButton
```

**Market Intel Page:**
```bash
# app/workspace/[id]/app/[appId]/market-intelligence/page.tsx
→ Copy from "B. Competitor Spy Page Refactor" above
→ Replace button logic with StageButton
```

**Optimizer Page:**
```bash
# app/workspace/[id]/app/[appId]/optimizer/page.tsx
→ Copy from "3. AI Listing Optimizer Page Refactor" above
→ Fetch vault on mount, display signals
```

### Step 3: Test Workflow

```
1. Go to Reviews page
2. Click "Stage Issue" button
3. Toast appears: "Successfully Staged"
4. Issue appears in Optimizer's vault summary
5. Go to Optimizer page
6. See staged issue in "Issues to Address" section
7. Click "Generate Listing"
8. Generation uses staged signals as MANDATORY constraints
```

---

## 6. TypeScript Types for Reference

```typescript
// Type for StageButton props
type SignalType = 
  | "keyword"
  | "review_issue"
  | "competitor_weakness"
  | "optimization_insight";

type SignalSource =
  | "keyword_spotlight"
  | "keyword_tracker"
  | "review_analysis"
  | "competitor_spy"
  | "manual"
  | "api";

interface VaultSignal {
  id: string;
  workspace_id: string;
  signal_type: SignalType;
  content: string;
  language: string;       // "en", "ar", "fr", etc
  is_rtl: boolean;        // true for ar, he, fa, ur
  metadata: {
    [key: string]: any;   // Custom fields (rank, score, etc)
  };
  created_at: string;     // ISO8601
}

interface AppVaultContext {
  keywords: VaultSignal[];
  reviewIssues: VaultSignal[];
  competitorWeaknesses: VaultSignal[];
  optimizationInsights: VaultSignal[];
  total: number;
  lastUpdated: string;
}
```

---

## 7. Common Issues & Solutions

### Issue 1: Toast Not Appearing

**Cause:** `ToastContainer` not in layout

**Fix:**
```typescript
// app/layout.tsx
import { ToastContainer } from "@/components/Toast";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <ToastContainer /> {/* Required */}
      </body>
    </html>
  );
}
```

### Issue 2: Arabic Text Not RTL

**Cause:** Not setting `dir` attribute

**Fix:**
```typescript
// Wrong
<div>{arabicContent}</div>

// Right
<div dir="rtl" lang="ar">
  {arabicContent}
</div>

// Or use StageButton with language prop
<StageButton language="ar" ... />
```

### Issue 3: Vault Not Appearing in Optimizer

**Cause:** Not fetching or useEffect not set up

**Fix:**
```typescript
useEffect(() => {
  const fetchVault = async () => {
    const response = await fetch(
      `/api/workspaces/${workspaceId}/staging/list?appId=${appId}`
    );
    const data = await response.json();
    setVault(data);
  };

  fetchVault();
}, [workspaceId, appId]);
```

### Issue 4: Content Not Preserving UTF-8 (Arabic)

**Cause:** Encoding issue in transit

**Fix:** Ensure headers and API accept `Content-Type: application/json; charset=utf-8`
```typescript
const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json; charset=utf-8",
  },
  body: JSON.stringify({
    content: arabicText, // UTF-8 preserved
  }),
});
```

---

## 8. Migration Checklist

```
SETUP:
☐ Copy StageButton.tsx to components/staging/
☐ Add ToastContainer to root layout
☐ Test toast appears/dismisses

REVIEWS PAGE:
☐ Replace "Add to Optimization Backlog" button with StageButton
☐ Pass review metadata (rating, category, userCount)
☐ Track stagedIssues state
☐ Test Arabic reviews work with dir="rtl"

COMPETITOR SPY PAGE:
☐ Replace "Stage Competitor Exploit" button with StageButton
☐ Pass competitor metadata (name, impact, market share)
☐ Track stagedWeaknesses state
☐ Test competitor names support both languages

MARKET INTEL PAGE:
☐ Replace "Optimize Listing with Market Spotlight" button with StageButton
☐ Pass keyword metadata (volume, difficulty, trend, market)
☐ Track stagedKeywords state
☐ Test keywords in Arabic work with dir="rtl"

OPTIMIZER PAGE:
☐ Add useEffect to fetch vault on mount
☐ Display vault summary (counts, keywords, issues)
☐ Add StagingVaultPreview widget to right sidebar
☐ Test vault appears immediately without refresh
☐ Test vault refreshes every 30 seconds

TESTING:
☐ Stage keyword from Market Intel → appears in Optimizer
☐ Stage issue from Reviews → appears in Optimizer
☐ Stage weakness from Spy → appears in Optimizer
☐ Arabic content preserves RTL direction
☐ Arabic content preserves UTF-8 characters
☐ Toast notifications work in both languages
☐ No page refresh or navigation
☐ Buttons disable during API call
☐ Error handling shows graceful message
```

---

## 9. Performance Tips

1. **Memoize StageButton** if rendering many times:
   ```typescript
   export const StageButton = React.memo(StageButtonComponent);
   ```

2. **Debounce vault refresh** in optimizer:
   ```typescript
   const [refreshTime, setRefreshTime] = useState(Date.now());
   
   useEffect(() => {
     const timer = setTimeout(() => {
       fetchVault();
     }, 30000);
     return () => clearTimeout(timer);
   }, [refreshTime]);
   ```

3. **Cache vault with SWR** for live updates:
   ```typescript
   import useSWR from "swr";
   
   const { data: vault } = useSWR(
     `/api/workspaces/${workspaceId}/staging/list?appId=${appId}`,
     fetcher,
     { revalidateOnFocus: false, refreshInterval: 30000 }
   );
   ```

---

**Status:** ✅ Ready for Implementation

Copy the exact code examples above and integrate into your pages today!
