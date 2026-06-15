/**
 * Keyword Viability Validator Service
 *
 * Heuristic-based keyword difficulty scoring without external APIs.
 * Powers the Quick Win Keyword Validator feature for indie developers.
 *
 * Scoring Model:
 * - Difficulty (0-10): Based on keyword length, category saturation
 * - Search Volume (estimated): Calculated from keyword length patterns
 * - Competition: App category baseline + keyword-specific adjustments
 * - Monthly Installs Projection: Low/Medium/High scenarios
 * - Confidence: 0-100 based on data quality and market dynamics
 *
 * Output: Viability recommendation (high_confidence, medium_opportunity, skip_this)
 */

export interface KeywordDifficultyMetrics {
  difficulty: number; // 0-10
  searchVolume: number; // estimated monthly searches
  competition: number; // 0-100, percentage
  confidenceScore: number; // 0-100
}

export interface MonthlyInstallsProjection {
  low: number;
  medium: number;
  high: number;
  scenario: "conservative" | "realistic" | "optimistic";
}

export interface KeywordViabilityScore {
  keyword: string;
  language: "en" | "ar";
  difficulty: KeywordDifficultyMetrics;
  monthlyInstalls: MonthlyInstallsProjection;
  recommendation: "high_confidence" | "medium_opportunity" | "skip_this";
  reasoning: string;
  confidence: number; // 0-100
  tags: string[];
}

/**
 * Keyword Viability Service
 * Provides heuristic-based keyword scoring for ASO optimization
 */
export class KeywordViabilityService {
  /**
   * Category baseline competitiveness levels (0-100)
   * Used to adjust difficulty calculations
   */
  private static readonly CATEGORY_BASELINES: Record<string, number> = {
    game: 85,
    productivity: 75,
    photo: 70,
    finance: 80,
    health: 65,
    education: 60,
    lifestyle: 55,
    travel: 50,
    music: 65,
    shopping: 70,
    default: 70,
  };

  /**
   * Validate a keyword across multiple Play Store markets in parallel.
   * Applies per-market volume/competition adjustments on a shared base score.
   */
  async validateKeywordForMarkets(
    keyword: string,
    markets: string[],
    category: string = "default",
    language: "en" | "ar" = "en",
  ): Promise<Record<string, KeywordViabilityScore>> {
    const normalizedMarkets = [
      ...new Set(
        markets
          .map((m) => m.trim().toLowerCase())
          .filter((m) => m.length >= 2),
      ),
    ];
    const targets = normalizedMarkets.length > 0 ? normalizedMarkets : ["us"];

    const base = await this.validateKeyword(keyword, category, language);
    const out: Record<string, KeywordViabilityScore> = {};
    for (const market of targets) {
      out[market] = this.applyMarketAdjustments(base, market);
    }
    return out;
  }

  /**
   * Per-market heuristics — relative to US baseline.
   */
  private marketFactors(market: string): { volume: number; competition: number } {
    const factors: Record<string, { volume: number; competition: number }> = {
      us: { volume: 1, competition: 1 },
      gb: { volume: 0.32, competition: 0.92 },
      ca: { volume: 0.28, competition: 0.88 },
      au: { volume: 0.22, competition: 0.85 },
      in: { volume: 0.9, competition: 0.72 },
      sa: { volume: 0.24, competition: 0.68 },
      ae: { volume: 0.18, competition: 0.7 },
      eg: { volume: 0.35, competition: 0.65 },
      de: { volume: 0.38, competition: 0.9 },
      fr: { volume: 0.34, competition: 0.88 },
      br: { volume: 0.55, competition: 0.78 },
      mx: { volume: 0.42, competition: 0.74 },
      id: { volume: 0.62, competition: 0.7 },
      pk: { volume: 0.48, competition: 0.66 },
    };
    return factors[market] ?? { volume: 0.4, competition: 0.8 };
  }

  private applyMarketAdjustments(
    base: KeywordViabilityScore,
    market: string,
  ): KeywordViabilityScore {
    const { volume, competition } = this.marketFactors(market);
    const searchVolume = Math.max(
      500,
      Math.round(base.difficulty.searchVolume * volume),
    );
    const competitionPct = Math.max(
      0,
      Math.min(100, Math.round(base.difficulty.competition * competition)),
    );
    const difficulty = parseFloat(
      Math.max(0, Math.min(10, base.difficulty.difficulty * (0.85 + competition * 0.15))).toFixed(1),
    );

    const monthlyInstalls = this.projectMonthlyInstalls(
      difficulty,
      searchVolume,
      competitionPct,
    );

    const confidence = this.calculateConfidence(
      difficulty,
      searchVolume,
      "default",
    );

    const recommendation = this.determineRecommendation(
      difficulty,
      confidence,
      monthlyInstalls.medium,
    );

    const marketLabel = market.toUpperCase();

    return {
      ...base,
      keyword: base.keyword,
      difficulty: {
        ...base.difficulty,
        difficulty,
        searchVolume,
        competition: competitionPct,
        confidenceScore: confidence,
      },
      monthlyInstalls,
      recommendation,
      confidence,
      reasoning: `${base.reasoning} Market focus: ${marketLabel}.`,
      tags: [...new Set([...base.tags, `market-${market}`])],
    };
  }

  /**
   * Validate a keyword and return viability score
   */
  async validateKeyword(
    keyword: string,
    category: string = "default",
    language: "en" | "ar" = "en"
  ): Promise<KeywordViabilityScore> {
    const normalizedKeyword = keyword.trim().toLowerCase();

    // Calculate difficulty metrics
    const difficulty = this.calculateDifficulty(normalizedKeyword, category);

    // Estimate search volume
    const searchVolume = this.estimateSearchVolume(normalizedKeyword, language);

    // Calculate competition
    const competition = this.estimateCompetition(normalizedKeyword, category);

    // Project monthly installs
    const monthlyInstalls = this.projectMonthlyInstalls(
      difficulty.difficulty,
      searchVolume,
      competition
    );

    // Calculate confidence score
    const confidenceScore = this.calculateConfidence(
      difficulty.difficulty,
      searchVolume,
      category
    );

    // Determine recommendation
    const recommendation = this.determineRecommendation(
      difficulty.difficulty,
      confidenceScore,
      monthlyInstalls.medium
    );

    // Generate reasoning
    const reasoning = this.generateReasoning(
      normalizedKeyword,
      difficulty.difficulty,
      monthlyInstalls.medium,
      recommendation
    );

    // Identify tags
    const tags = this.identifyTags(normalizedKeyword, difficulty.difficulty);

    return {
      keyword: normalizedKeyword,
      language,
      difficulty,
      monthlyInstalls,
      recommendation,
      reasoning,
      confidence: confidenceScore,
      tags,
    };
  }

  /**
   * Calculate keyword difficulty (0-10 scale)
   * Factors:
   * - Keyword length: Longer keywords = lower difficulty
   * - Word count: More words = lower difficulty
   * - Common patterns: Brand names, generics increase difficulty
   * - Category baseline: Some categories are more competitive
   */
  private calculateDifficulty(keyword: string, category: string): KeywordDifficultyMetrics {
    const words = keyword.split(/\s+/).length;
    const length = keyword.length;
    const categoryBaseline = KeywordViabilityService.CATEGORY_BASELINES[category] ?? 70;

    // Difficulty inversely correlates with keyword specificity
    // Long-tail keywords (5+ words, 20+ chars) are easier to rank for
    let baseDifficulty = 8; // Start high

    if (words >= 4) baseDifficulty -= 3; // Long-tail: -3
    else if (words === 3) baseDifficulty -= 2; // 3-word: -2
    else if (words === 2) baseDifficulty -= 0.5; // 2-word: -0.5

    if (length >= 25) baseDifficulty -= 1.5; // Very specific
    else if (length >= 15) baseDifficulty -= 0.5; // Somewhat specific

    // Brand detection (increases difficulty)
    if (this.looksLikeBrand(keyword)) {
      baseDifficulty += 2;
    }

    // Clamp to 0-10 range
    const difficulty = Math.max(0, Math.min(10, baseDifficulty));

    // Competition is category-adjusted
    const competition = Math.round(
      (categoryBaseline * (difficulty / 10)) + (Math.random() * 10 - 5) // Add realism with variance
    );

    return {
      difficulty: parseFloat(difficulty.toFixed(1)),
      searchVolume: this.estimateSearchVolume(keyword, "en"),
      competition: Math.max(0, Math.min(100, competition)),
      confidenceScore: this.calculateConfidence(difficulty, this.estimateSearchVolume(keyword, "en"), category),
    };
  }

  /**
   * Estimate search volume based on keyword characteristics
   * Uses heuristic patterns without external APIs
   */
  private estimateSearchVolume(keyword: string, language: "en" | "ar"): number {
    const words = keyword.split(/\s+/).length;
    const length = keyword.length;

    // Base search volume inversely correlates with keyword length
    let baseVolume = 100000; // Generic 1-word keyword baseline

    if (words === 1) baseVolume = 150000; // Single words get more volume
    else if (words === 2) baseVolume = 80000;
    else if (words === 3) baseVolume = 40000;
    else if (words === 4) baseVolume = 15000; // Long-tail
    else baseVolume = 5000; // Very long-tail

    // Adjust by length for more specificity
    if (length > 30) baseVolume *= 0.6;
    else if (length > 20) baseVolume *= 0.8;

    // Language adjustment
    // Arabic has roughly 1/3 the search volume of English globally
    if (language === "ar") {
      baseVolume *= 0.33;
    }

    // Add realistic variance (+/- 20%)
    const variance = baseVolume * 0.2 * (Math.random() - 0.5);
    const finalVolume = Math.max(500, baseVolume + variance);

    return Math.round(finalVolume);
  }

  /**
   * Estimate competition based on keyword and category
   * Returns 0-100 percentile
   */
  private estimateCompetition(keyword: string, category: string): number {
    const categoryBaseline = KeywordViabilityService.CATEGORY_BASELINES[category] ?? 70;
    const words = keyword.split(/\s+/).length;

    let adjustedCompetition = categoryBaseline;

    // Long-tail keywords have lower competition
    if (words >= 4) adjustedCompetition -= 20;
    else if (words === 3) adjustedCompetition -= 10;

    // Brand keywords increase competition
    if (this.looksLikeBrand(keyword)) adjustedCompetition += 15;

    // Generic terms increase competition
    if (this.isGenericTerm(keyword)) adjustedCompetition += 15;

    // Clamp to 0-100
    return Math.max(0, Math.min(100, adjustedCompetition));
  }

  /**
   * Project monthly installs across three scenarios
   */
  private projectMonthlyInstalls(
    difficulty: number,
    searchVolume: number,
    competition: number
  ): MonthlyInstallsProjection {
    // Base potential from search volume * (1 - competition factor)
    const competitionFactor = competition / 100;
    const difficultyFactor = difficulty / 10;

    // Conversion rates vary by scenario
    const conversionRateLow = 0.005; // 0.5%
    const conversionRateMedium = 0.015; // 1.5%
    const conversionRateHigh = 0.035; // 3.5%

    // Apply difficulty penalty (harder keywords = lower conversion)
    const difficultyPenalty = 1 - difficultyFactor * 0.5; // Up to 50% penalty

    const low = Math.round(
      searchVolume * conversionRateLow * (1 - competitionFactor * 0.7) * difficultyPenalty
    );
    const medium = Math.round(
      searchVolume * conversionRateMedium * (1 - competitionFactor * 0.5) * difficultyPenalty
    );
    const high = Math.round(
      searchVolume * conversionRateHigh * (1 - competitionFactor * 0.3) * difficultyPenalty
    );

    return {
      low: Math.max(0, low),
      medium: Math.max(0, medium),
      high: Math.max(0, high),
      scenario: "realistic",
    };
  }

  /**
   * Calculate confidence score (0-100)
   * Accounts for data quality and market maturity
   */
  private calculateConfidence(difficulty: number, searchVolume: number, category: string): number {
    let confidence = 75; // Base confidence

    // Higher difficulty = lower confidence in projections
    confidence -= difficulty * 3; // Up to -30

    // Very low search volume = lower confidence
    if (searchVolume < 1000) confidence -= 15;
    else if (searchVolume < 5000) confidence -= 5;

    // Established categories = higher confidence
    const establishedCategories = ["game", "productivity", "photo", "finance"];
    if (establishedCategories.includes(category)) confidence += 10;

    // Clamp to 0-100
    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Determine recommendation based on metrics
   */
  private determineRecommendation(
    difficulty: number,
    confidence: number,
    projectedInstalls: number
  ): "high_confidence" | "medium_opportunity" | "skip_this" {
    // High confidence: Easy keywords with good install potential
    if (difficulty <= 4 && projectedInstalls >= 100 && confidence >= 70) {
      return "high_confidence";
    }

    // Medium opportunity: Moderate difficulty but decent potential
    if (difficulty <= 6 && projectedInstalls >= 50 && confidence >= 60) {
      return "medium_opportunity";
    }

    // Skip: Too difficult or low potential
    return "skip_this";
  }

  /**
   * Generate human-readable reasoning
   */
  private generateReasoning(
    keyword: string,
    difficulty: number,
    projectedInstalls: number,
    recommendation: string
  ): string {
    const difficultyLevel =
      difficulty <= 3 ? "easy" : difficulty <= 6 ? "moderate" : "challenging";

    if (recommendation === "high_confidence") {
      return `"${keyword}" is a ${difficultyLevel} keyword with estimated potential of ${projectedInstalls}+ monthly installs. Strong ranking opportunity for indie developers.`;
    } else if (recommendation === "medium_opportunity") {
      return `"${keyword}" is a ${difficultyLevel} keyword with estimated potential of ${projectedInstalls}+ monthly installs. Worth testing with strong listing optimization.`;
    } else {
      return `"${keyword}" is too ${difficultyLevel} (difficulty ${difficulty}/10) with low install potential (${projectedInstalls}). Consider more specific long-tail variants.`;
    }
  }

  /**
   * Identify relevant tags for keyword
   */
  private identifyTags(keyword: string, difficulty: number): string[] {
    const tags: string[] = [];

    const words = keyword.split(/\s+/).length;
    if (words >= 4) tags.push("long-tail");
    if (words === 1) tags.push("high-volume");
    if (difficulty <= 3) tags.push("easy-rank");
    if (difficulty >= 7) tags.push("competitive");
    if (this.looksLikeBrand(keyword)) tags.push("branded");
    if (this.isGenericTerm(keyword)) tags.push("generic");

    return tags;
  }

  /**
   * Detect if keyword looks like a brand name
   */
  private looksLikeBrand(keyword: string): boolean {
    const brandIndicators = /^[A-Z][a-z]+(\s[A-Z][a-z]+)*$/;
    return brandIndicators.test(keyword);
  }

  /**
   * Detect if keyword is a generic/category term
   */
  private isGenericTerm(keyword: string): boolean {
    const genericTerms = [
      "app",
      "game",
      "photo",
      "editor",
      "calendar",
      "notes",
      "music",
      "player",
      "camera",
      "social",
    ];
    return genericTerms.some((term) => keyword.includes(term));
  }

  /**
   * Batch validate multiple keywords
   */
  async validateKeywordsBatch(
    keywords: string[],
    category: string = "default",
    language: "en" | "ar" = "en"
  ): Promise<KeywordViabilityScore[]> {
    return Promise.all(
      keywords.map((kw) => this.validateKeyword(kw, category, language))
    );
  }

  /**
   * Get top N keywords by recommendation score
   */
  async getTopKeywords(
    keywords: string[],
    limit: number = 5,
    category: string = "default"
  ): Promise<KeywordViabilityScore[]> {
    const scores = await this.validateKeywordsBatch(keywords, category);

    // Sort by recommendation priority and confidence
    const priorityMap = {
      high_confidence: 3,
      medium_opportunity: 2,
      skip_this: 0,
    };

    return scores
      .sort((a, b) => {
        const aPriority = priorityMap[a.recommendation];
        const bPriority = priorityMap[b.recommendation];
        if (aPriority !== bPriority) return bPriority - aPriority;
        return b.confidence - a.confidence;
      })
      .slice(0, limit);
  }
}

export default KeywordViabilityService;
