/**
 * ASO Synthesizer Service - Enhanced with Constraints
 *
 * Generates optimized listing content using Gemini 2.5-Flash.
 * Now respects baseline snapshots and keyword viability scores.
 *
 * Features:
 * - Baseline snapshot awareness (for variant generation)
 * - High-confidence keyword filtering (>= 75%)
 * - Medium-confidence fallback (50-75%)
 * - Constraint-aware prompting
 * - Expectation framing (Estimated vs Guaranteed)
 * - Graceful degradation
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface SynthesisContext {
  appName: string;
  appCategory: string;
  currentTitle?: string;
  currentShortDescription?: string;
  currentFullDescription?: string;
  language: "en" | "ar";
  locale: string;

  // Signal inputs
  reviewItems: string[];
  marketItems: string[];
  competitorItems: string[];
}

export interface SynthesisContextWithConstraints extends SynthesisContext {
  // Constraint inputs
  baselineSnapshotId?: string;
  currentListing?: {
    title: string;
    shortDescription: string;
    fullDescription: string;
  };
  keywordViabilityScores?: Array<{
    keyword: string;
    confidence: number;
    recommendation: string;
  }>;
  experimentMetadata?: Record<string, unknown>;
}

export interface SynthesisOutput {
  title: string;
  shortDescription: string;
  fullDescription: string;
  ctaButton: string;
  strategy: string;
  asoScore: number;
  frameType: "estimated_potential" | "guaranteed_results";
  warnings?: string[];
}

/**
 * ASO Synthesizer Service
 * Generates optimized app listings with constraint awareness
 */
export class ASOSynthesizerService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY environment variable not set");
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Synthesize listing with constraints (baseline snapshot & viability scores)
   */
  async synthesizeListingWithConstraints(
    context: SynthesisContextWithConstraints
  ): Promise<SynthesisOutput> {
    console.log("[ASOSynthesizerService] 🚀 Synthesizing with constraints:", {
      app: context.appName,
      language: context.language,
      hasBaseline: !!context.baselineSnapshotId,
      hasViabilityScores: !!context.keywordViabilityScores,
    });

    // Extract high-confidence keywords
    const highConfidenceKeywords = this.extractHighConfidenceKeywords(
      context.keywordViabilityScores
    );

    // Extract medium-confidence keywords as fallback
    const mediumConfidenceKeywords = this.extractMediumConfidenceKeywords(
      context.keywordViabilityScores
    );

    // Build constraint-aware prompt
    const prompt = this.buildConstraintAwarePrompt(context, {
      highConfidence: highConfidenceKeywords,
      mediumConfidence: mediumConfidenceKeywords,
      hasBaseline: !!context.baselineSnapshotId,
    });

    try {
      // Call Gemini with constraint-aware prompt
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      console.log("[ASOSynthesizerService] ✅ Gemini response received");

      // Parse and validate response
      const parsed = this.parseResponse(responseText, context.language);

      // Validate confidence framing
      this.validateConfidenceFraming(parsed);

      return parsed;
    } catch (error) {
      console.error("[ASOSynthesizerService] ❌ Synthesis error:", error);
      throw new Error(`Synthesis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Synthesize listing (backward compatible, no constraints)
   */
  async synthesizeListing(context: SynthesisContext): Promise<SynthesisOutput> {
    const constraintContext: SynthesisContextWithConstraints = {
      ...context,
      keywordViabilityScores: [],
    };

    return this.synthesizeListingWithConstraints(constraintContext);
  }

  /**
   * Extract high-confidence keywords (>= 75%)
   */
  private extractHighConfidenceKeywords(
    scores?: Array<{
      keyword: string;
      confidence: number;
      recommendation: string;
    }>
  ): string[] {
    if (!scores || scores.length === 0) return [];

    return scores
      .filter((s) => s.confidence >= 75)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map((s) => s.keyword);
  }

  /**
   * Extract medium-confidence keywords (50-75%) as fallback
   */
  private extractMediumConfidenceKeywords(
    scores?: Array<{
      keyword: string;
      confidence: number;
      recommendation: string;
    }>
  ): string[] {
    if (!scores || scores.length === 0) return [];

    return scores
      .filter((s) => s.confidence >= 50 && s.confidence < 75)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map((s) => s.keyword);
  }

  /**
   * Build constraint-aware prompt for Gemini
   */
  private buildConstraintAwarePrompt(
    context: SynthesisContextWithConstraints,
    constraints: {
      highConfidence: string[];
      mediumConfidence: string[];
      hasBaseline: boolean;
    }
  ): string {
    const isArabic = context.language === "ar";

    // Core app info
    let prompt = isArabic ? `أنت خبير تحسين متاجر التطبيقات (ASO) متخصص في العربية.` : `You are an expert ASO specialist.`;

    prompt += `\n\nApp: ${context.appName}`;
    prompt += `\nCategory: ${context.appCategory}`;
    prompt += `\nLanguage: ${context.language.toUpperCase()}`;

    // Baseline constraint
    if (constraints.hasBaseline && context.currentListing) {
      prompt += `\n\n## BASELINE CONSTRAINT (Current Production Listing)`;
      prompt += `\nUse this as reference—generate VARIANTS, not replacements:`;
      prompt += `\n- Current Title: "${context.currentListing.title}"`;
      prompt += `\n- Current Short Desc: "${context.currentListing.shortDescription}"`;
      prompt += `\n- Current Full Desc: "${context.currentListing.fullDescription}"`;
    }

    // Viability scores constraint
    if (constraints.highConfidence.length > 0) {
      prompt += `\n\n## HIGH-CONFIDENCE KEYWORDS (confidence >= 75%)`;
      prompt += `\nPrioritize these in title and descriptions:`;
      constraints.highConfidence.forEach((kw) => {
        prompt += `\n- "${kw}"`;
      });
    }

    if (constraints.mediumConfidence.length > 0) {
      prompt += `\n\n## MEDIUM-CONFIDENCE KEYWORDS (confidence 50-75%, fallback)`;
      prompt += `\nInclude if natural, don't force:`;
      constraints.mediumConfidence.forEach((kw) => {
        prompt += `\n- "${kw}"`;
      });
    }

    // Signal inputs
    if (context.reviewItems.length > 0) {
      prompt += `\n\n## REVIEW INSIGHTS (User Feedback)`;
      context.reviewItems.slice(0, 3).forEach((item) => {
        prompt += `\n- ${item}`;
      });
    }

    if (context.marketItems.length > 0) {
      prompt += `\n\n## MARKET OPPORTUNITIES`;
      context.marketItems.slice(0, 3).forEach((item) => {
        prompt += `\n- ${item}`;
      });
    }

    if (context.competitorItems.length > 0) {
      prompt += `\n\n## COMPETITOR ANALYSIS`;
      context.competitorItems.slice(0, 5).forEach((item) => {
        prompt += `\n- ${item}`;
      });
    }

    // Output requirements
    prompt += `\n\n## OUTPUT REQUIREMENTS`;
    prompt += `\nRespond ONLY with valid JSON (no markdown, no code blocks):`;
    prompt += `\n{`;
    prompt += `\n  "title": "string (max 50 chars, include high-confidence keywords)",`;
    prompt += `\n  "shortDescription": "string (max 80 chars)",`;
    prompt += `\n  "fullDescription": "string (max 4000 chars)",`;
    prompt += `\n  "ctaButton": "string (action-oriented button text)",`;
    prompt += `\n  "strategy": "string (2-3 sentence strategy summary)",`;
    prompt += `\n  "asoScore": number (0-100, realism over hype),`;
    prompt += `\n  "frameType": "estimated_potential" (NOT guaranteed_results)`;
    prompt += `\n}`;

    // Critical framing instruction
    prompt += `\n\n## CRITICAL: EXPECTATION FRAMING`;
    prompt += `\nAlways frame installs as "Estimated Potential" never "Guaranteed Results"`;
    prompt += `\nExample BAD: "This will get 10,000 installs"`;
    prompt += `\nExample GOOD: "Has potential to reach 10,000+ monthly installs based on market analysis"`;
    prompt += `\nASO Score should reflect realistic ranking potential (not aspirational)`;

    return prompt;
  }

  /**
   * Parse Gemini response
   */
  private parseResponse(responseText: string, language: string): SynthesisOutput {
    // Clean response (remove markdown code blocks if present)
    let cleanedText = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    // Try to extract JSON from response
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No valid JSON found in response");
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error("Failed to parse JSON response");
    }

    // Validate required fields
    const requiredFields = [
      "title",
      "shortDescription",
      "fullDescription",
      "ctaButton",
      "strategy",
      "asoScore",
    ];
    for (const field of requiredFields) {
      if (!parsed[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    return {
      title: String(parsed.title).substring(0, 50),
      shortDescription: String(parsed.shortDescription).substring(0, 80),
      fullDescription: String(parsed.fullDescription).substring(0, 4000),
      ctaButton: String(parsed.ctaButton),
      strategy: String(parsed.strategy),
      asoScore: Math.min(100, Math.max(0, parseInt(parsed.asoScore) || 50)),
      frameType: parsed.frameType === "guaranteed_results" ? "estimated_potential" : "estimated_potential",
      warnings: [],
    };
  }

  /**
   * Validate that response uses proper framing
   */
  private validateConfidenceFraming(output: SynthesisOutput): void {
    const warnings: string[] = [];

    // Check for absolute language
    const absolutePatterns = [
      /will get \d+/i,
      /will reach \d+/i,
      /guaranteed \d+/i,
      /promises? \d+/i,
      /ensures? \d+/i,
    ];

    const fullText = `${output.title} ${output.shortDescription} ${output.fullDescription} ${output.strategy}`;

    for (const pattern of absolutePatterns) {
      if (pattern.test(fullText)) {
        warnings.push(`Uses absolute language ("${pattern.source}") - should be estimated`);
      }
    }

    // Force frame type to estimated_potential
    output.frameType = "estimated_potential";

    if (warnings.length > 0) {
      console.warn("[ASOSynthesizerService] ⚠️ Framing warnings:", warnings);
      output.warnings = warnings;
    }
  }

  /**
   * Synthesize variant listing (from baseline snapshot)
   */
  async synthesizeVariant(
    baselineContext: SynthesisContextWithConstraints,
    variantName: string
  ): Promise<SynthesisOutput> {
    const variantContext: SynthesisContextWithConstraints = {
      ...baselineContext,
      baselineSnapshotId: baselineContext.baselineSnapshotId,
    };

    console.log("[ASOSynthesizerService] 🔄 Synthesizing variant:", {
      variantName,
      baselineId: variantContext.baselineSnapshotId,
    });

    return this.synthesizeListingWithConstraints(variantContext);
  }
}

export default ASOSynthesizerService;
