/**
 * ASO Report Card Types & Interfaces
 *
 * Professional-grade app listing analysis with full LTR/RTL support.
 * Scores: Readability (1-100), Keyword Density (1-100), Conversion Potential (1-100).
 * Context-aware from existing listing_generations data.
 *
 * Localization:
 * - English (LTR): Standard left-to-right analysis
 * - Arabic (RTL): Right-to-left context, market-specific terminology
 */

/**
 * Input: App listing metadata for analysis
 */
export interface AsoListingInput {
  /** App ID (for context lookup) */
  appId: string;

  /** App name */
  appName: string;

  /** Store listing title (max 50 chars) */
  title: string;

  /** Short description (max 80 chars) */
  shortDescription: string;

  /** Full description (max 4000 chars) */
  fullDescription: string;

  /** Target keywords (optional, for keyword density comparison) */
  targetKeywords?: string[];

  /** App category (e.g., "games", "productivity", "health") */
  category?: string;

  /** Locale for localized analysis ("en", "ar", "he", etc.) */
  locale: string;

  /** Context: Previous listing generation (if available) */
  previousGenerationContext?: {
    title?: string;
    shortDescription?: string;
    fullDescription?: string;
    strategySummary?: string;
    keywordSuggestions?: string[];
  };
}

/**
 * Individual score breakdown
 * Each score has a numerical value and human-readable interpretation
 */
export interface ScoreBreakdown {
  /** Score 1-100 */
  score: number;

  /** Category: "excellent" (80+), "good" (60-79), "fair" (40-59), "poor" (1-39) */
  category: "excellent" | "good" | "fair" | "poor";

  /** Brief explanation of the score */
  explanation: string;

  /** Key factors contributing to this score */
  factors: string[];
}

/**
 * Readability Score
 * Measures complexity, clarity, and ease of understanding for users
 */
export interface ReadabilityScore extends ScoreBreakdown {
  /** Additional metric: Average sentence length */
  avgSentenceLength: number;

  /** Additional metric: Flesch-Kincaid grade level (approx.) */
  gradeLevel: number;

  /** Whether the title is clear and compelling */
  titleClarity: "strong" | "adequate" | "weak";

  /** Whether the description flows naturally */
  descriptionFlow: "natural" | "functional" | "disjointed";
}

/**
 * Keyword Density Score
 * Evaluates how well the listing incorporates target keywords
 */
export interface KeywordDensityScore extends ScoreBreakdown {
  /** Detected keywords from the listing */
  detectedKeywords: {
    keyword: string;
    frequency: number;
    placement: ("title" | "shortDesc" | "fullDesc")[];
  }[];

  /** Target keywords that are missing */
  missingKeywords?: string[];

  /** Keywords that are over-emphasized (potential keyword stuffing) */
  overEmphasizedKeywords?: string[];

  /** Overall keyword balance assessment */
  keywordBalance: "optimized" | "balanced" | "sparse" | "stuffed";
}

/**
 * Conversion Potential Score
 * Qualitative assessment based on narrative arc, emotional appeal, CTA effectiveness
 */
export interface ConversionPotentialScore extends ScoreBreakdown {
  /** Narrative Arc Assessment */
  narrativeArc: {
    hasHook: boolean; // Does it grab attention in first 10 words?
    hasFeatures: boolean; // Are key features highlighted?
    hasSocialProof: boolean; // Are credibility signals present?
    hasCallToAction: boolean; // Is there a strong CTA?
    structure: "strong" | "adequate" | "weak";
  };

  /** Emotional Appeal */
  emotionalAppeal: "compelling" | "adequate" | "weak";

  /** Call-to-action effectiveness */
  callToActionStrength: "strong" | "present" | "missing";

  /** Value proposition clarity */
  valuePropositionClarity: "crystal-clear" | "clear" | "unclear";
}

/**
 * Single actionable tip for improvement
 */
export interface ActionableTip {
  /** Priority: 1 (highest), 2 (medium), 3 (lowest) */
  priority: 1 | 2 | 3;

  /** Category: "readability", "keywords", "conversion", "structure" */
  category: "readability" | "keywords" | "conversion" | "structure";

  /** Clear action to take */
  action: string;

  /** Why this matters (impact on users/ranking) */
  rationale: string;

  /** Specific example or suggestion */
  example?: string;

  /** Estimated effort: "quick" (5 min), "medium" (15 min), "involved" (30+ min) */
  effort: "quick" | "medium" | "involved";
}

/**
 * Complete ASO Report Card
 * Combines all scores and actionable insights
 */
export interface AsoReportCard {
  /** Metadata */
  id: string;
  appId: string;
  appName: string;
  locale: string;
  createdAt: string;
  version: "1.0"; // For future compatibility

  /** Overall Score (average of three scores) */
  overallScore: number;
  overallCategory: "excellent" | "good" | "fair" | "poor";

  /** Individual Scores */
  readability: ReadabilityScore;
  keywordDensity: KeywordDensityScore;
  conversionPotential: ConversionPotentialScore;

  /** Actionable Tips (3 prioritized steps) */
  actionableTips: ActionableTip[];

  /** Market-Specific Insights */
  marketInsights: {
    locale: string;
    marketContext: string; // "English-speaking markets", "Arabic-speaking markets", etc.
    culturalNotes?: string; // RTL-specific or market-specific context
    competitorContext?: string; // How this compares to typical app in category
  };

  /** Historical trend (if previous report exists) */
  trend?: {
    previousOverallScore?: number;
    improvement: number; // Points changed (positive = improvement)
    lastUpdated?: string;
  };

  /** Recommendations for Next Steps */
  nextSteps: {
    immediate: string; // Do this first
    shortTerm: string; // Follow up within a week
    longTerm: string; // Ongoing optimization
  };

  /** Metadata for UI rendering */
  metadata: {
    generatedBy: "gemini-pro"; // For transparency
    promptVersion: number;
    analysisTimeMs: number;
    confidence: "high" | "medium" | "low";
  };
}

/**
 * Database Schema: aso_reports
 * For caching and historical tracking
 */
export interface AsoReportDatabase {
  id: string;
  workspace_id: string;
  app_id: string;
  app_name: string;
  locale: string;

  // Scores (JSON for flexibility)
  overall_score: number;
  readability_score: number;
  keyword_density_score: number;
  conversion_potential_score: number;

  // Report (full JSON)
  report_data: AsoReportCard;

  // Input data (for audit trail)
  input_data: AsoListingInput;

  // Timestamps
  created_at: string;
  updated_at: string;

  // Tracking
  generation_time_ms: number;
  gemini_tokens_used?: number;

  // Audit
  created_by_user_id: string;
  is_manual_override: boolean; // If user modified report
}

/**
 * Report Summary (for list view)
 * Lightweight version for dashboards
 */
export interface AsoReportSummary {
  id: string;
  appName: string;
  locale: string;
  overallScore: number;
  overallCategory: "excellent" | "good" | "fair" | "poor";
  createdAt: string;
  topTip: ActionableTip; // Most impactful action
  trend?: {
    improvement: number;
    direction: "up" | "down" | "stable";
  };
}

/**
 * Report Export Format (PDF/CSV)
 */
export interface AsoReportExport {
  format: "pdf" | "csv" | "json";
  filename: string;
  mimeType: string;
  content: Buffer | string; // Raw file content
}

/**
 * Gemini Analysis Response (before transformation)
 */
export interface GeminiAsoAnalysisResponse {
  overallScore: number;
  readabilityScore: ReadabilityScore;
  keywordDensityScore: KeywordDensityScore;
  conversionPotentialScore: ConversionPotentialScore;
  actionableTips: ActionableTip[];
  marketInsights: {
    locale: string;
    marketContext: string;
    culturalNotes?: string;
    competitorContext?: string;
  };
  nextSteps: {
    immediate: string;
    shortTerm: string;
    longTerm: string;
  };
}

/**
 * Validation Result for Report Card
 */
export interface ReportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  scoreConsistency: "valid" | "warning"; // Scores should be 1-100 and consistent
}
