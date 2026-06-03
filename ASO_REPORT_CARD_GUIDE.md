# ASO Report Card (Pillar 3) — Implementation Guide

## Overview

The ASO Report Card provides professional-grade app listing analysis with:
- **3 Scores** (1-100): Readability, Keyword Density, Conversion Potential
- **3 Actionable Tips**: Prioritized, effort-estimated, context-aware
- **Full Localization**: English (LTR) and Arabic (RTL) with market-specific insights
- **Database Integration**: Caching, history tracking, improvement metrics
- **Premium Feature**: Value-add for paying users, drives engagement

---

## Architecture

```
User Generates ASO Report
    ↓
app/api/aso-reports/generate
    ├── Load listing data (title, short desc, full desc)
    ├── Check for previous generation (context-awareness)
    ├── Call buildAsoAnalysisPrompt(locale)
    │   └── LTR prompt (English) or RTL prompt (Arabic)
    ├── callGeminiWithRetry() with retry middleware
    ├── Extract + verify JSON response
    ├── Transform into AsoReportCard
    ├── Save to aso_reports table
    └── Return report to client

Client Renders Report
    ↓
components/aso-report-card/AsoReportCard.tsx
    ├── Display overall score + category
    ├── Show three individual scores
    │   ├── Readability (with factors, title clarity, flow)
    │   ├── Keyword Density (with detected keywords, balance)
    │   └── Conversion Potential (narrative arc, CTA strength)
    ├── Render 3 actionable tips
    │   └── Priority badge, category, action, effort badge
    ├── Market insights (locale-aware)
    ├── Improvement trend (if previous report exists)
    └── Export/Download button (PDF or JSON)
```

---

## Type Signatures

### Input

```typescript
interface AsoListingInput {
  appId: string;
  appName: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  targetKeywords?: string[];
  category?: string;
  locale: string; // "en", "ar", etc.
  previousGenerationContext?: {
    title?: string;
    shortDescription?: string;
    strategySummary?: string;
    keywordSuggestions?: string[];
  };
}
```

### Output

```typescript
interface AsoReportCard {
  id: string;
  appId: string;
  appName: string;
  locale: string;
  createdAt: string;

  // Overall
  overallScore: number; // 1-100
  overallCategory: "excellent" | "good" | "fair" | "poor";

  // Individual Scores
  readability: ReadabilityScore; // With avgSentenceLength, gradeLevel, titleClarity
  keywordDensity: KeywordDensityScore; // With detectedKeywords[], keywordBalance
  conversionPotential: ConversionPotentialScore; // With narrativeArc, emotionalAppeal

  // Actionable Insights
  actionableTips: ActionableTip[]; // Exactly 3
  // Each tip: { priority (1-3), category, action, rationale, example, effort }

  // Market Context
  marketInsights: {
    locale: string;
    marketContext: string; // "English-speaking markets" or "Arabic-speaking markets"
    culturalNotes?: string;
    competitorContext?: string;
  };

  // Recommendations
  nextSteps: {
    immediate: string;
    shortTerm: string;
    longTerm: string;
  };

  // Metadata
  metadata: {
    generatedBy: "gemini-pro";
    promptVersion: number;
    analysisTimeMs: number;
    confidence: "high" | "medium" | "low";
  };
}
```

---

## Gemini Prompt Structure

**Key Principles:**
1. **Market-Aware** — Different guidance for English vs Arabic markets
2. **JSON-First** — Response is pure JSON, no markdown
3. **Hard-Clamp Verified** — Dangerous keywords stripped pre-API
4. **Structured Output** — Exact fields ensure parseable response
5. **Localized Metrics** — Score explanations specific to locale

**Prompt Flow:**

```
1. Context: Market (LTR/RTL), Category, Keywords
2. Analysis Tasks:
   - Readability: Grade level, sentence structure, title clarity, flow
   - Keyword Density: Frequency, placement, balance (not stuffed)
   - Conversion Potential: Narrative arc (Hook → Features → Proof → CTA), appeal
3. Output Format: JSON with exact schema
4. Validation Checklist: Score ranges, field completeness, locale awareness
```

**See:** `lib/gemini/build-aso-analysis-prompt.ts`

---

## Integration Points

### 1. API Route: Generate Report

**File:** `app/api/aso-reports/generate/route.ts`

```typescript
import { generateAsoReportCard } from "@/lib/gemini/generate-aso-report-card";
import { saveAsoReport } from "@/lib/supabase/aso-reports";

export async function POST(req: Request) {
  const { appId, title, shortDescription, fullDescription, locale } = await req.json();

  // Load previous generation for context (optional)
  const previousReport = await loadLatestAsoReport(workspaceId, appId, locale);

  // Generate new report
  const report = await generateAsoReportCard(client, {
    appId,
    appName: appData.name,
    title,
    shortDescription,
    fullDescription,
    locale,
    targetKeywords: appData.keywords,
    category: appData.category,
    previousGenerationContext: previousReport ? {
      strategySummary: previousReport.marketInsights.competitorContext,
      keywordSuggestions: previousReport.keywordDensity.detectedKeywords.map(k => k.keyword),
    } : undefined,
  });

  // Save to database
  await saveAsoReport(workspaceId, userId, report, { title, shortDescription, fullDescription });

  return Response.json(report);
}
```

---

### 2. UI Component: Report Card Display

**File:** `components/aso-report-card/AsoReportCard.tsx`

```typescript
import type { AsoReportCard } from "@/lib/gemini/aso-report-card-types";

export function AsoReportCard({ report }: { report: AsoReportCard }) {
  return (
    <div className="aso-report-card">
      {/* Overall Score */}
      <div className="overall-score">
        <ScoreBadge score={report.overallScore} category={report.overallCategory} />
        <p>Professional ASO Analysis for {report.appName}</p>
      </div>

      {/* Three Scores Grid */}
      <div className="scores-grid">
        <ScoreCard title="Readability" score={report.readability} />
        <ScoreCard title="Keyword Density" score={report.keywordDensity} />
        <ScoreCard title="Conversion Potential" score={report.conversionPotential} />
      </div>

      {/* Actionable Tips */}
      <div className="actionable-tips">
        <h3>Recommended Actions (Prioritized)</h3>
        {report.actionableTips.map((tip, i) => (
          <TipCard key={i} tip={tip} />
        ))}
      </div>

      {/* Market Insights */}
      <div className="market-insights">
        <h4>Market Insights</h4>
        <p>{report.marketInsights.marketContext}</p>
        {report.marketInsights.culturalNotes && (
          <p className="cultural-note">{report.marketInsights.culturalNotes}</p>
        )}
      </div>

      {/* Improvement Trend */}
      {report.trend && (
        <div className="trend">
          <TrendIndicator improvement={report.trend.improvement} />
        </div>
      )}

      {/* Export */}
      <div className="export-buttons">
        <button onClick={() => exportPDF(report)}>📄 Export PDF</button>
        <button onClick={() => exportJSON(report)}>⬇️ Download JSON</button>
      </div>
    </div>
  );
}
```

**Component Structure:**

```
AsoReportCard.tsx
├── ScoreBadge
│   ├── Circle with score (0-100)
│   ├── Color: Green (80+), Blue (60-79), Orange (40-59), Red (1-39)
│   └── Category label
├── ScoreCard (3x)
│   ├── Title
│   ├── Score + category
│   ├── Explanation
│   ├── Key factors list
│   └── Extra metrics (grade level, keyword balance, CTA strength)
├── TipCard (3x)
│   ├── Priority badge (1, 2, 3)
│   ├── Category badge (readability, keywords, conversion, structure)
│   ├── Action (the thing to do)
│   ├── Rationale (why it matters)
│   ├── Example (concrete suggestion)
│   └── Effort badge (quick, medium, involved)
├── MarketInsights
│   ├── Market context
│   └── Cultural/RTL notes
├── TrendIndicator (if prev report)
│   └── Direction + improvement points
└── ExportButtons
    ├── PDF download
    └── JSON download
```

---

### 3. Database Operations

```typescript
// Generate + save
const report = await generateAsoReportCard(client, input);
await saveAsoReport(workspaceId, userId, report, input);

// Load latest
const latest = await loadLatestAsoReport(workspaceId, appId, "en");

// Load history
const history = await loadAsoReportHistory(workspaceId, appId);

// Check for recent report (avoid duplicate generation)
const hasRecent = await hasRecentAsoReport(workspaceId, appId, "en", 24); // 24h

// Get improvement metrics
const improvement = await getAsoReportImprovement(workspaceId, appId, "en");
// Returns: { previousScore, currentScore, improvement, direction }

// Workspace statistics
const stats = await getAsoReportStatistics(workspaceId);
// Returns: totalReports, appsWithReports, avgScore, scoreDistribution, localesUsed
```

---

## LTR/RTL Localization

### English (LTR) Analysis
- Standard readability metrics (Flesch-Kincaid grade level)
- Keyword optimization for English-speaking markets
- Conversion tactics common in Western app stores
- Left-to-right reading flow assumptions

### Arabic (RTL) Analysis
- Readability adjusted for Arabic sentence structure and complexity
- Keyword optimization for Arabic-speaking markets (different search behavior)
- Conversion tactics specific to Middle East/North Africa markets
- Right-to-left reading flow validation
- Market-specific insights (e.g., religious/cultural considerations, holiday timing)

**Example Difference:**
```
English tip: "Use power words like 'Free', 'New', 'Limited' in title"
Arabic tip: "Focus on benefit-driven language; Arabic users value transparency and trust"
```

---

## UI Component: PDF Export

**File:** `lib/aso-reports/export-pdf.ts`

```typescript
import { jsPDF } from "jspdf"; // Or use a server-side PDF library

export async function exportAsoReportPDF(report: AsoReportCard): Promise<Blob> {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(16);
  doc.text(`ASO Report Card - ${report.appName}`, 10, 10);

  // Overall Score
  doc.setFontSize(12);
  doc.text(`Overall Score: ${report.overallScore}/100 (${report.overallCategory})`, 10, 20);

  // Three Scores
  doc.setFontSize(11);
  let y = 30;
  doc.text(`Readability: ${report.readability.score}`, 10, y);
  doc.text(`Keyword Density: ${report.keywordDensity.score}`, 10, y + 10);
  doc.text(`Conversion Potential: ${report.conversionPotential.score}`, 10, y + 20);

  // Actionable Tips
  y += 40;
  doc.setFontSize(12);
  doc.text("Actionable Tips", 10, y);
  y += 10;

  report.actionableTips.forEach((tip, i) => {
    doc.setFontSize(10);
    doc.text(`${i + 1}. [P${tip.priority}] ${tip.action}`, 10, y);
    doc.setFontSize(9);
    doc.text(`   ${tip.rationale}`, 10, y + 5);
    y += 15;
  });

  // Footer
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date(report.createdAt).toLocaleDateString()}`, 10, doc.internal.pageSize.height - 10);

  return doc.output("blob");
}
```

---

## Integration with Existing Listing Optimizer

The ASO Report Card is **context-aware** of your existing listing_generations data:

```typescript
// When generating a report, check if app has previous listing optimization
const previousGeneration = await db.query(`
  SELECT title, shortDescription, strategySummary, keywordSuggestions
  FROM listing_generations
  WHERE appId = $1 AND workspaceId = $2
  ORDER BY createdAt DESC
  LIMIT 1
`);

// Pass as context to Gemini prompt
const report = await generateAsoReportCard(client, {
  ...input,
  previousGenerationContext: previousGeneration ? {
    title: previousGeneration.title,
    strategySummary: previousGeneration.strategySummary,
    keywordSuggestions: previousGeneration.keywordSuggestions,
  } : undefined,
});
```

This ensures the ASO Report Card understands:
- What was previously optimized
- What keywords were suggested
- What strategic positioning was chosen
- How recommendations have evolved

---

## Feature: Improvement Tracking

Compare reports over time:

```typescript
import { compareReports } from "@/lib/gemini/generate-aso-report-card";

const previousReport = await loadLatestAsoReport(workspaceId, appId, locale);
const newReport = await generateAsoReportCard(client, input);

const comparison = compareReports(previousReport, newReport);
// Returns: {
//   overallImprovement: +5,
//   direction: "up",
//   readabilityImprovement: +8,
//   keywordImprovement: -2,
//   conversionImprovement: +4
// }
```

Then attach to report:
```typescript
report.trend = {
  previousOverallScore: previousReport.overallScore,
  improvement: comparison.overallImprovement,
  lastUpdated: previousReport.createdAt,
};
```

---

## Testing

Run tests:
```bash
npm test lib/gemini/__tests__/aso-report-card.test.ts
```

Test coverage:
- Prompt generation (LTR and RTL)
- Response validation (scores, fields, tips)
- JSON parsing (markdown code blocks, whitespace)
- Localization (market-specific language)
- Report validation (ranges, completeness)

---

## Deployment Checklist

- [ ] Database migration: `supabase db push`
- [ ] Create API route: `app/api/aso-reports/generate/route.ts`
- [ ] Create UI components: `AsoReportCard.tsx`, `ScoreCard.tsx`, `TipCard.tsx`
- [ ] Add PDF export: `lib/aso-reports/export-pdf.ts`
- [ ] Connect to listing optimizer (context-awareness)
- [ ] Add to metrics/telemetry dashboard
- [ ] Run tests: `npm test lib/gemini/__tests__/aso-report-card.test.ts`
- [ ] QA in staging:
  - [ ] Generate report in English
  - [ ] Generate report in Arabic
  - [ ] Verify scores are 1-100
  - [ ] Verify 3 tips are present
  - [ ] Export PDF and verify layout
  - [ ] Load previous report and verify context-awareness
- [ ] Deploy to production
- [ ] Monitor report generation success rate
- [ ] Track feature engagement (% of users generating reports)

---

## Success Metrics

**For Product:**
- % of users generating ASO reports (engagement)
- Average time spent in ASO Report Card (time-on-feature)
- PDF export usage (value perception)

**For Analytics:**
- Average overall score by category (where are users weak?)
- Most common tip #1 (what's the biggest issue?)
- Improvement rate (% of users improving after acting on tips)

---

## Future Enhancements

1. **One-Click Fixes** — Auto-apply tip recommendations to listing
2. **Competitive Analysis** — Compare score to top competitors in category
3. **A/B Testing** — Test which tips have highest conversion impact
4. **Seasonal Insights** — Holiday-specific recommendations (e.g., Black Friday)
5. **Market Intelligence** — Trending keywords per market/locale
6. **Weekly Digest** — Email users their improvement metrics

---

**Status:** ✅ Ready for Implementation
