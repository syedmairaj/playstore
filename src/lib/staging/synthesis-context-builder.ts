/**
 * Synthesis Context Builder - Token-Aware Context Extraction
 *
 * Builds synthesizer context from vault state
 * Respects token budget, prioritizes high-value signals
 */

import {
  WorkspaceStagingVault,
  SynthesisContext,
  SynthesisContextConfig,
} from "./vault.types";

export class SynthesisContextBuilder {
  /**
   * Build context from vault for synthesizer
   *
   * Strategy:
   * 1. Extract all feature data
   * 2. Prioritize by impact (keywords > competitors > reviews > feedback)
   * 3. Summarize to stay within token budget
   * 4. Format for Gemini consumption
   */
  async buildContext(
    vault: WorkspaceStagingVault,
    locale: "en" | "ar",
    config: SynthesisContextConfig = {}
  ): Promise<SynthesisContext> {
    const {
      maxTokens = 6000,
      maxKeywords = 20,
      maxCompetitors = 5,
      maxThemes = 5,
      prioritizeHighDifficulty = false,
    } = config;

    const state = locale === "en" ? vault.state_en : vault.state_ar;
    const features = state.features;

    console.log(`[SynthesisContextBuilder] Building context:`, {
      locale,
      appId: vault.app_id,
      featuresAvailable: Object.keys(features),
    });

    // Extract data from each feature
    const context: SynthesisContext = {
      app: {
        appId: vault.app_id,
        workspaceId: vault.workspace_id,
        locale,
      },

      // Priority 1: Keywords (highest impact on ASO) — validator signals first
      stagedKeywords: this.extractKeywords(
        features.keyword_validator,
        features.keyword_tracker?.keywords || [],
        maxKeywords,
        prioritizeHighDifficulty
      ),

      // Priority 2: Competitor analysis
      competitorInsights: this.extractCompetitorGaps(
        features.competitor_spy?.competitors || [],
        maxCompetitors
      ),

      // Priority 3: Review sentiments & themes
      reviewInsights: this.extractReviewThemes(features.review_analysis || {}, maxThemes),

      // Priority 4: Validator score (highest-confidence validator signal)
      validatorScore: this.extractValidatorScore(features.keyword_validator),

      // Priority 5: Baseline snapshot
      baselineSnapshot: features.experiment_snapshots?.baselines?.[0]?.listing,

      // Priority 6: User feedback
      feedbackSummary: this.summarizeFeedback(
        features.user_feedback?.survey_responses || []
      ),

      // Metadata
      metadata: {
        featuresPresent: Object.keys(features),
        synthesisDate: new Date().toISOString(),
        locale,
        estimatedTokens: 0, // Will be calculated
      },
    };

    // Estimate tokens
    const tokenCount = this.estimateTokens(context);
    context.metadata.estimatedTokens = tokenCount;

    if (tokenCount > maxTokens) {
      console.warn(`[SynthesisContextBuilder] Token budget exceeded:`, {
        estimated: tokenCount,
        budget: maxTokens,
        truncating: true,
      });

      // Truncate least important data
      context.reviewInsights.positiveThemes =
        context.reviewInsights.positiveThemes.slice(0, 2);
      context.reviewInsights.improvements =
        context.reviewInsights.improvements.slice(0, 2);
      context.competitorInsights = context.competitorInsights.slice(0, 2);
      context.feedbackSummary = context.feedbackSummary.slice(0, 2);

      // Re-estimate
      context.metadata.estimatedTokens = this.estimateTokens(context);
    }

    console.log(`[SynthesisContextBuilder] ✅ Context built:`, {
      locale,
      estimatedTokens: context.metadata.estimatedTokens,
      keywordCount: context.stagedKeywords.length,
      competitorCount: context.competitorInsights.length,
      reviewThemes: context.reviewInsights.positiveThemes.length,
    });

    return context;
  }

  /**
   * Extract validator score from signals map or legacy validated_keywords array.
   */
  private extractValidatorScore(
    validatorFeature: any
  ): SynthesisContext["validatorScore"] | undefined {
    if (!validatorFeature) return undefined;

    const signals = validatorFeature.signals;
    if (signals && typeof signals === "object") {
      const entries = Object.values(signals) as any[];
      const best = entries.sort(
        (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)
      )[0];
      if (best) {
        return {
          confidence: best.confidence ?? 0,
          recommendation: best.recommendation ?? "",
        };
      }
    }

    const legacy = validatorFeature.validated_keywords?.[0];
    if (legacy) {
      return {
        confidence: legacy.confidence ?? 0,
        recommendation: legacy.recommendation ?? "",
      };
    }

    return undefined;
  }

  /**
   * Extract and prioritize keywords — validator signals FIRST, then tracker.
   */
  private extractKeywords(
    validatorFeature: any,
    trackerKeywords: any[],
    maxCount: number,
    prioritizeHighDifficulty: boolean
  ): SynthesisContext["stagedKeywords"] {
    const validatorKeywords = this.extractValidatorKeywordEntries(validatorFeature);

    // Validator first (priority), then tracker
    const combined = [
      ...validatorKeywords.map((k) => ({
        term: k.term,
        difficulty: k.difficulty || 5,
        volume: k.volume || 0,
        rank_position: k.rank_position,
        confidence: k.confidence ?? 0,
        source: "validator" as const,
      })),
      ...trackerKeywords.map((k) => ({
        term: k.term,
        difficulty: k.difficulty || 5,
        volume: k.volume || 0,
        rank_position: k.rank_position,
        confidence: undefined,
        source: "tracker" as const,
      })),
    ];

    // Deduplicate by term (prefer validator — already ordered first)
    const deduped = new Map<string, any>();
    for (const kw of combined) {
      if (!deduped.has(kw.term) || kw.source === "validator") {
        deduped.set(kw.term, kw);
      }
    }

    // Sort: validator source first, then confidence (Keyword Tracker drives ASO)
    let sorted = Array.from(deduped.values());
    if (prioritizeHighDifficulty) {
      sorted = sorted.sort((a, b) => {
        if (a.source === "validator" && b.source !== "validator") return -1;
        if (b.source === "validator" && a.source !== "validator") return 1;
        return b.difficulty - a.difficulty;
      });
    } else {
      sorted = sorted.sort((a, b) => {
        if (a.source === "validator" && b.source !== "validator") return -1;
        if (b.source === "validator" && a.source !== "validator") return 1;
        return (b.confidence || 0) - (a.confidence || 0);
      });
    }

    const tierFor = (confidence: number | undefined): "high" | "medium" | "low" => {
      const c = confidence ?? 0;
      if (c >= 75) return "high";
      if (c >= 50) return "medium";
      return "low";
    };

    // Truncate to max
    return sorted.slice(0, maxCount).map((k) => ({
      term: k.term,
      difficulty: k.difficulty,
      volume: k.volume,
      confidence: k.confidence,
      rank_position: k.rank_position,
      source: k.source,
      tier: tierFor(k.confidence),
    }));
  }

  /**
   * Read keyword_validator.signals map (+ legacy validated_keywords array).
   */
  private extractValidatorKeywordEntries(validatorFeature: any): Array<{
    term: string;
    difficulty: number;
    volume: number;
    confidence: number;
    rank_position?: number;
  }> {
    if (!validatorFeature) return [];

    const fromSignals: Array<{
      term: string;
      difficulty: number;
      volume: number;
      confidence: number;
      rank_position?: number;
    }> = [];

    const signals = validatorFeature.signals;
    if (signals && typeof signals === "object") {
      for (const [key, raw] of Object.entries(signals)) {
        const entry = raw as Record<string, unknown>;
        const term =
          typeof entry.keyword === "string" ? entry.keyword : key;
        const liveRanks = entry.live_ranks as Record<string, { rank: number | null }> | undefined;
        let rank_position: number | undefined;
        if (liveRanks) {
          const firstRank = Object.values(liveRanks).find((r) => r.rank != null);
          rank_position = firstRank?.rank ?? undefined;
        }
        fromSignals.push({
          term,
          difficulty: (entry.difficulty as number) ?? 5,
          volume: (entry.search_volume as number) ?? (entry.searchVolume as number) ?? 0,
          confidence: (entry.confidence as number) ?? 0,
          rank_position,
        });
      }
    }

    if (fromSignals.length > 0) {
      return fromSignals.sort((a, b) => b.confidence - a.confidence);
    }

    const legacy = validatorFeature.validated_keywords;
    if (Array.isArray(legacy)) {
      return legacy.map((k: any) => ({
        term: k.term ?? k.keyword,
        difficulty: k.difficulty ?? 5,
        volume: k.search_volume ?? k.searchVolume ?? 0,
        confidence: k.confidence ?? 0,
      }));
    }

    return [];
  }

  /**
   * Extract competitor weaknesses as our opportunities
   */
  private extractCompetitorGaps(
    competitors: any[],
    maxCount: number
  ): SynthesisContext["competitorInsights"] {
    return competitors
      .slice(0, maxCount)
      .map((c) => ({
        competitor: c.app_name || c.name,
        weaknesses: c.weaknesses || [],
        ourOpportunities: c.keywords
          ?.filter((k: any) => k.category === "high_volume")
          .map((k: any) => k.term) || [],
      }));
  }

  /**
   * Extract positive themes and improvement opportunities from reviews
   */
  private extractReviewThemes(
    analysis: any,
    maxThemesCount: number
  ): SynthesisContext["reviewInsights"] {
    const positive =
      analysis.themes
        ?.filter((t: any) => t.sentiment === "positive")
        .slice(0, maxThemesCount) || [];

    const improvements = analysis.opportunities?.slice(0, 3) || [];

    return {
      summary: analysis.summary || {
        total_reviews: 0,
        avg_rating: 0,
        trend: "unknown",
      },
      positiveThemes: positive.map((t: any) => ({
        theme: t.theme,
        count: t.count || 0,
        keywords: t.keywords || [],
      })),
      improvements: improvements.map((o: any) => ({
        issue: o.issue,
        count: o.count || 0,
        suggestedFix: o.suggested_fix,
      })),
    };
  }

  /**
   * Summarize user feedback survey responses
   */
  private summarizeFeedback(responses: any[]): SynthesisContext["feedbackSummary"] {
    const themes = new Map<string, number>();

    for (const resp of responses) {
      if (resp.response) {
        const key = resp.response.toLowerCase().substring(0, 50);
        themes.set(key, (themes.get(key) || 0) + 1);
      }
    }

    return Array.from(themes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([theme, count]) => ({ theme, count }));
  }

  /**
   * Estimate token count (rough: 1 token ≈ 4 characters)
   */
  private estimateTokens(context: SynthesisContext): number {
    const jsonStr = JSON.stringify(context);
    return Math.ceil(jsonStr.length / 4);
  }
}

/**
 * Global instance
 */
export const synthesisContextBuilder = new SynthesisContextBuilder();
