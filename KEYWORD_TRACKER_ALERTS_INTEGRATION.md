# Keyword Tracker & Alerts Integration with Staging Vault

**Status:** ✅ Complete — Ready for Component Wiring  
**Last Updated:** June 4, 2026

---

## Overview

Keyword Tracker and Alerts modules now integrate seamlessly with Staging Vault. Users can stage keywords and alerts with a single click, preserving metadata (rank, country code, severity, language) for downstream generation.

**Key Files:**
- `lib/staging-vault/keyword-tracker-staging.ts` — Keyword → Vault integration (350 lines)
- `lib/staging-vault/alerts-staging.ts` — Alerts → Vault integration (265 lines)
- `components/staging/KeywordTrackerStagingButton.tsx` — UI button component
- `components/staging/AlertsStagingButton.tsx` — UI button component
- `components/staging/StagingVaultPreview.tsx` — Dashboard preview widget
- `components/Toast.tsx` — Toast notification system
- `hooks/useToast.ts` — Toast hook

---

## Architecture

### Metadata Preservation

Both modules preserve rich context for generation:

**Keywords:**
```typescript
{
  countryCode: "US" | "SA" | "AE",      // Regional targeting
  currentRank: 5,                        // Competitive position
  previousRank: 8,                       // Rank change
  searchVolume: 12000,                   // Demand signal
  difficulty: 45,                        // Competitive difficulty
  trend: "up" | "down" | "stable",      // Direction
  locale: "en-US" | "ar-SA",            // Full locale for i18n
  isRtl: boolean,                        // Auto-detected
  directionality: "ltr" | "rtl"         // CSS dir attribute
}
```

**Alerts:**
```typescript
{
  alertType: "sentiment_drop" | "crash_spike" | ...,
  severity: "critical" | "high" | "medium" | "low",
  detectedAt: ISO8601,
  locale: "en-US" | "ar-SA",
  countryCode: "US",                     // Optional regional context
  previousValue: 4.8,                    // Before the drop
  currentValue: 4.2,                     // After the drop
  changePercent: -12.5,                  // Magnitude of change
  affectedCountries: ["US", "CA"],       // Multi-region impact
  competitorName: "Competitor X",        // Attribution
  category: "UI/UX" | "Performance"      // Domain
}
```

### RTL/LTR Support

Automatic detection based on language codes:
- **RTL languages:** ar, he, fa, ur → `is_rtl = true`, `directionality = "rtl"`
- **LTR languages:** en, fr, de, etc → `is_rtl = false`, `directionality = "ltr"`

Arabic content preserved exactly (full UTF-8 support).

---

## Usage Patterns

### Pattern 1: Stage Single Keyword

**In Keyword Tracker page:**

```typescript
import { KeywordTrackerStagingButton } from "@/components/staging/KeywordTrackerStagingButton";

export function KeywordRow({ keyword }: { keyword: TrackedKeyword }) {
  return (
    <tr>
      <td>{keyword.keyword}</td>
      <td>#{keyword.currentRank}</td>
      <td>{keyword.countryCode}</td>
      <td>{keyword.searchVolume}</td>
      <td>
        <KeywordTrackerStagingButton
          workspaceId={workspaceId}
          appId={appId}
          keyword={keyword}
          onStaged={() => {
            // Refresh keyword list or show checkmark
          }}
        />
      </td>
    </tr>
  );
}
```

### Pattern 2: Stage Single Alert

**In Alerts page:**

```typescript
import { AlertsStagingButton } from "@/components/staging/AlertsStagingButton";

export function AlertCard({ alert }: { alert: AppAlert }) {
  return (
    <div className="border rounded p-4">
      <h3>{alert.alertType}</h3>
      <p>{alert.description}</p>
      <badge>{alert.severity}</badge>
      <AlertsStagingButton
        workspaceId={workspaceId}
        appId={appId}
        alert={alert}
        onStaged={() => {
          // Mark as staged or update UI
        }}
      />
    </div>
  );
}
```

### Pattern 3: Bulk Stage High-Severity Alerts

**In Alerts page, batch action:**

```typescript
import { stageHighSeverityAlerts } from "@/lib/staging-vault/alerts-staging";

async function handleStageAll() {
  const result = await stageHighSeverityAlerts(
    supabase,
    workspaceId,
    alerts,
    "high" // Only stage high/critical
  );

  showToast({
    type: "success",
    title: "Alerts Staged",
    message: `${result.staged} alerts ready for optimizer`,
  });
}
```

### Pattern 4: Vault Preview in Dashboard

**In Dashboard/Optimizer header:**

```typescript
import { StagingVaultPreview } from "@/components/staging/StagingVaultPreview";

export function OptimizerHeader() {
  return (
    <div className="flex gap-4">
      <div className="flex-1">
        {/* Other content */}
      </div>
      <div className="w-80">
        <StagingVaultPreview
          workspaceId={workspaceId}
          appId={appId}
          onGenerateClick={() => {
            // Trigger generation with vault signals
          }}
        />
      </div>
    </div>
  );
}
```

---

## Service Layer Functions

### Keyword Tracker

#### `stageKeywordFromTracker()`
Stage a single keyword with full metadata.

```typescript
const result = await stageKeywordFromTracker(supabase, workspaceId, appId, {
  id: "kw-123",
  keyword: "dark mode app",
  countryCode: "US",
  currentRank: 5,
  searchVolume: 12000,
  language: "en",
  locale: "en-US",
});

// Returns: { id: "...", message: 'Staged keyword "dark mode app"...' }
```

#### `stageMultipleKeywords()`
Bulk stage keywords with error handling.

```typescript
const result = await stageMultipleKeywords(supabase, workspaceId, appId, keywords);

// Returns: { staged: 45, failed: 2, errors: [...] }
```

#### `stageTopKeywords()`
Stage top N keywords by search volume.

```typescript
const result = await stageTopKeywords(supabase, workspaceId, appId, keywords, 10);

// Returns: { staged: 10, message: "Staged top 10 keywords for app-123" }
```

#### `stageKeywordsByCountry()`
Stage keywords for specific country.

```typescript
const result = await stageKeywordsByCountry(supabase, workspaceId, appId, keywords, "SA");

// Returns: { staged: 23, message: "Staged 23 keywords for SA" }
```

#### `getKeywordLocalizationContext()`
Get language/RTL metadata for display.

```typescript
const ctx = getKeywordLocalizationContext(keyword);

// Returns: { language: "en", locale: "en-US", isRtl: false, directionality: "ltr", countryCode: "US" }

// Usage in template:
<div lang={ctx.language} dir={ctx.directionality}>
  {keyword.keyword}
</div>
```

### Alerts

#### `stageAlert()`
Stage a single alert with severity/context.

```typescript
const result = await stageAlert(supabase, workspaceId, {
  id: "alert-456",
  alertType: "sentiment_drop",
  severity: "high",
  description: "Rating dropped 0.5 stars in 48 hours",
  language: "en",
  locale: "en-US",
  detectedAt: new Date().toISOString(),
  context: {
    previousValue: 4.8,
    currentValue: 4.3,
    changePercent: -10.4,
  },
});

// Returns: { id: "...", message: "Staged high alert: Sentiment Drop" }
```

#### `stageHighSeverityAlerts()`
Auto-stage only critical/high severity alerts.

```typescript
const result = await stageHighSeverityAlerts(supabase, workspaceId, alerts, "high");

// Returns: { staged: 5, skipped: 2, message: "Staged 5 high+ severity alerts" }
```

#### `stageUnresolvedAlerts()`
Stage all unresolved alerts above minimum severity.

```typescript
const result = await stageUnresolvedAlerts(supabase, workspaceId, alerts);

// Returns: { staged: 8, message: "Staged 8 unresolved alerts" }
```

#### `getAlertLocalizationContext()`
Get language/RTL metadata for display.

```typescript
const ctx = getAlertLocalizationContext(alert);

// Returns: { language: "ar", locale: "ar-SA", isRtl: true, directionality: "rtl", countryCode: "SA" }

// Usage in template:
<div lang={ctx.language} dir={ctx.directionality}>
  {alert.description}
</div>
```

---

## Component Integration

### Toast Setup (Required)

Add `ToastContainer` to root layout:

```typescript
// app/layout.tsx
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
        <ToastContainer />  {/* Add here */}
      </body>
    </html>
  );
}
```

### Button Integration (Example: Keyword Tracker Page)

```typescript
// app/workspace/[id]/app/[appId]/keyword-tracker/page.tsx
"use client";

import { useEffect, useState } from "react";
import { KeywordTrackerStagingButton } from "@/components/staging/KeywordTrackerStagingButton";
import type { TrackedKeyword } from "@/lib/staging-vault/keyword-tracker-staging";

export default function KeywordTrackerPage({
  params,
}: {
  params: { id: string; appId: string };
}) {
  const [keywords, setKeywords] = useState<TrackedKeyword[]>([]);

  useEffect(() => {
    // Load keywords from your data source
  }, []);

  return (
    <div>
      <h1>Keyword Tracker</h1>
      <table>
        <thead>
          <tr>
            <th>Keyword</th>
            <th>Rank</th>
            <th>Country</th>
            <th>Volume</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw) => (
            <tr key={kw.id}>
              <td>{kw.keyword}</td>
              <td>#{kw.currentRank}</td>
              <td>{kw.countryCode}</td>
              <td>{kw.searchVolume}</td>
              <td>
                <KeywordTrackerStagingButton
                  workspaceId={params.id}
                  appId={params.appId}
                  keyword={kw}
                  onStaged={(id) => {
                    // Optional: Mark as staged, disable button, etc.
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Testing Strategy

### Unit Tests: Service Layer

```typescript
// lib/staging-vault/keyword-tracker-staging.test.ts

describe("stageKeywordFromTracker", () => {
  it("preserves metadata including country code and rank", async () => {
    const keyword: TrackedKeyword = {
      id: "kw-123",
      keyword: "test keyword",
      countryCode: "US",
      currentRank: 5,
      language: "en",
      locale: "en-US",
    };

    const result = await stageKeywordFromTracker(supabase, workspaceId, appId, keyword);

    // Verify in database that metadata includes countryCode and currentRank
    const vault = await supabase
      .from("workspace_staging_vault")
      .select("*")
      .eq("id", result.id)
      .single();

    expect(vault.metadata.countryCode).toBe("US");
    expect(vault.metadata.currentRank).toBe(5);
  });

  it("detects RTL correctly for Arabic keywords", async () => {
    const keyword: TrackedKeyword = {
      id: "kw-ar-123",
      keyword: "تطبيق الترجمة",
      language: "ar",
      locale: "ar-SA",
      countryCode: "SA",
      currentRank: 1,
    };

    const result = await stageKeywordFromTracker(supabase, workspaceId, appId, keyword);

    const vault = await supabase
      .from("workspace_staging_vault")
      .select("*")
      .eq("id", result.id)
      .single();

    expect(vault.is_rtl).toBe(true);
    expect(vault.language).toBe("ar");
  });
});
```

### E2E Tests: Full Pipeline

```typescript
// e2e/staging-vault.spec.ts

test("Stage keyword → Get vault context → Use in generation", async () => {
  // 1. Stage keyword from Keyword Tracker
  const stageResponse = await fetch("/api/workspaces/ws-123/staging/add", {
    method: "POST",
    body: JSON.stringify({
      signalType: "keyword",
      content: "dark mode",
      source: "keyword_tracker",
      language: "en",
      metadata: { countryCode: "US", currentRank: 5 },
    }),
  });
  expect(stageResponse.ok).toBe(true);

  // 2. Get vault context
  const listResponse = await fetch("/api/workspaces/ws-123/staging/list?appId=app-456");
  const vault = await listResponse.json();
  expect(vault.keywords).toHaveLength(1);
  expect(vault.keywords[0].content).toBe("dark mode");

  // 3. Verify metadata is available for generation
  expect(vault.keywords[0].metadata.countryCode).toBe("US");
  expect(vault.keywords[0].metadata.currentRank).toBe(5);
});

test("Stage alert with severity → Get vault context → Use in generation", async () => {
  const stageResponse = await fetch("/api/workspaces/ws-123/staging/add", {
    method: "POST",
    body: JSON.stringify({
      signalType: "optimization_insight",
      content: "[HIGH] Sentiment Drop: Rating dropped 0.5 stars",
      source: "api",
      language: "en",
      metadata: {
        alertType: "sentiment_drop",
        severity: "high",
        previousValue: 4.8,
        currentValue: 4.3,
      },
    }),
  });
  expect(stageResponse.ok).toBe(true);

  const listResponse = await fetch("/api/workspaces/ws-123/staging/list");
  const vault = await listResponse.json();
  expect(vault.optimizationInsights).toHaveLength(1);
  expect(vault.optimizationInsights[0].metadata.severity).toBe("high");
});
```

### Localization Tests

```typescript
// e2e/localization.spec.ts

test("Arabic signals preserve RTL metadata", async () => {
  const response = await fetch("/api/workspaces/ws-123/staging/add", {
    method: "POST",
    body: JSON.stringify({
      signalType: "keyword",
      content: "تحسين الأداء", // Arabic: "Performance Improvement"
      language: "ar",
      metadata: { locale: "ar-SA" },
    }),
  });

  const vault = await fetch("/api/workspaces/ws-123/staging/list").then(
    (r) => r.json()
  );

  expect(vault.keywords[0].is_rtl).toBe(true);
  expect(vault.keywords[0].language).toBe("ar");
  expect(vault.keywords[0].content).toBe("تحسين الأداء");
});

test("Mixed English/Arabic signals maintain directionality", async () => {
  await fetch("/api/workspaces/ws-123/staging/add", {
    method: "POST",
    body: JSON.stringify({
      signalType: "keyword",
      content: "dark mode",
      language: "en",
    }),
  });

  await fetch("/api/workspaces/ws-123/staging/add", {
    method: "POST",
    body: JSON.stringify({
      signalType: "keyword",
      content: "الوضع الداكن",
      language: "ar",
    }),
  });

  const vault = await fetch("/api/workspaces/ws-123/staging/list").then(
    (r) => r.json()
  );

  const enSignal = vault.keywords.find((k: any) => k.language === "en");
  const arSignal = vault.keywords.find((k: any) => k.language === "ar");

  expect(enSignal.is_rtl).toBe(false);
  expect(arSignal.is_rtl).toBe(true);
});
```

---

## Metadata Reference

### Keyword Metadata Schema

```typescript
interface KeywordMetadata {
  countryCode: string;         // "US", "SA", "AE", "UK", etc
  currentRank: number;         // 1-100+ (lower is better)
  previousRank?: number;       // For rank change delta
  searchVolume?: number;       // 1-1M+ monthly searches
  difficulty?: number;         // 0-100 (difficulty score)
  trend?: "up" | "down" | "stable";
  locale: string;              // "en-US", "ar-SA", etc
  lastUpdated: string;         // ISO8601
  isRtl: boolean;              // Auto-set: ar/he/fa/ur = true
  directionality: "ltr" | "rtl"; // CSS dir attribute
}
```

### Alert Metadata Schema

```typescript
interface AlertMetadata {
  alertType: string;           // "sentiment_drop", "crash_spike", etc
  severity: string;            // "critical", "high", "medium", "low"
  detectedAt: string;          // ISO8601
  resolvedAt?: string;         // ISO8601 (if resolved)
  locale: string;              // "en-US", "ar-SA", etc
  countryCode?: string;        // Regional context
  previousValue?: number | string;
  currentValue?: number | string;
  changePercent?: number;
  affectedCountries?: string[];
  competitorName?: string;
  category?: string;           // "UI/UX", "Performance", etc
  isRtl: boolean;              // Auto-set based on language
  directionality: "ltr" | "rtl";
}
```

---

## Brand Mirror Engine Integration

To consume vault keywords in listing generation:

```typescript
// lib/brand-mirror-engine.ts

export async function generateListingWithVaultConstraints(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
  basePrompt: string
) {
  // Get vault signals
  const vault = await getAppVaultContext(supabase, workspaceId, appId);

  // Extract vault keywords as mandatory constraints
  const vaultKeywords = vault.keywords.map((k) => k.content).join(", ");
  const vaultIssues = vault.reviewIssues.map((i) => i.content).join("; ");
  const vaultWeaknesses = vault.competitorWeaknesses
    .map((w) => w.content)
    .join("; ");

  // Build enhanced prompt with vault context
  const enhancedPrompt = `
    ${basePrompt}

    MANDATORY VAULT CONSTRAINTS:
    - Highlight these keywords: ${vaultKeywords}
    - Address these user issues: ${vaultIssues}
    - Differentiate from competitors on: ${vaultWeaknesses}

    Language Context:
    - Primary: ${vault.languages.primary || "English"}
    - RTL Support: ${vault.hasRtl ? "Yes (Arabic/Hebrew)" : "LTR only"}
  `;

  // Generate with enhanced prompt
  return await generateListing(enhancedPrompt);
}
```

---

## Consultant Layer Integration

To consume vault insights in roadmap generation:

```typescript
// lib/consultant-layer.ts

export async function generateRoadmapWithVaultInsights(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
  sprintCount: number = 4
) {
  const vault = await getAppVaultContext(supabase, workspaceId, appId);

  const vaultInsights = [
    ...vault.reviewIssues.map((i) => `User Issue: ${i.content}`),
    ...vault.competitorWeaknesses.map((w) => `Competitor Gap: ${w.content}`),
    ...vault.optimizationInsights.map((o) => `Insight: ${o.content}`),
  ];

  const prompt = `
    Create a ${sprintCount}-sprint roadmap addressing these vault signals:
    ${vaultInsights.join("\n")}

    Ensure each signal maps to at least one sprint tactic.
  `;

  return await generateRoadmap(prompt);
}
```

---

## Production Checklist

- [ ] Database migration applied in Supabase
- [ ] Service layer tested (unit tests pass)
- [ ] API endpoints tested (GET/POST working)
- [ ] Toast component added to layout
- [ ] Keyword Tracker button wired
- [ ] Alerts button wired
- [ ] Vault preview added to dashboard
- [ ] Brand Mirror Engine consumes vault context
- [ ] Consultant Layer consumes vault context
- [ ] E2E tests pass (stage → generate → verify)
- [ ] Arabic signals preserve RTL/UTF-8
- [ ] Multi-country keywords work correctly
- [ ] Alert severity filtering works
- [ ] Metadata preserved through pipeline
- [ ] Toast notifications auto-dismiss
- [ ] Error handling for network failures
- [ ] Soft delete works (signals can be undone)

---

## Support & Debugging

### Common Issues

**Issue: Arabic keywords showing as LTR**
- Check: `language` field set to "ar"
- Database should have `is_rtl = true`
- Frontend: Use `dir={signal.is_rtl ? "rtl" : "ltr"}`

**Issue: Toast not appearing**
- Check: `<ToastContainer />` added to root layout
- Check: `useToast()` hook imported from correct path
- Browser console for errors

**Issue: Metadata not preserved in vault**
- Check: `metadata` JSONB field populated in API call
- Database: Verify `metadata` column has data
- Service layer: `addSignalToVault()` spreading metadata correctly

### Debugging Commands

```bash
# Check vault signals in database
select id, content, language, is_rtl, metadata from workspace_staging_vault
where workspace_id = 'ws-123' and deleted_at is null;

# Check service layer logs
grep "\[KeywordTrackerStaging\]" /var/log/app.log
grep "\[AlertsStaging\]" /var/log/app.log

# Test API endpoint directly
curl -X GET "http://localhost:3000/api/workspaces/ws-123/staging/list?appId=app-456"
```

---

## Next Steps

1. **Wire components into pages** — Add staging buttons to Keyword Tracker and Alerts
2. **Test metadata flow** — Verify keywords/alerts reach generation with full context
3. **Update generation logic** — Use vault context as mandatory constraints
4. **Monitor adoption** — Track which signals are most useful for generation
5. **Optimize metadata** — Add domain-specific fields based on user feedback

---

**Questions?** Refer to source files for detailed implementations and inline comments.
