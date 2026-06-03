/**
 * ASO Report Card Generation Service
 *
 * Main orchestrator for generating professional ASO analysis.
 * Integrates with Gemini, validates responses, and handles LTR/RTL localization.
 */

import type { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  AsoListingInput,
  AsoReportCard,
  GeminiAsoAnalysisResponse,
  ReportValidationResult,
} from "./aso-report-card-types";
import {
  buildAsoAnalysisPrompt,
  verifyAnalysisResponse,
  extractJsonFromResponse,
} from "./build-aso-analysis-prompt";
import { callGeminiWithRetry } from "@/lib/retry/gemini-retry";
import { v4 as uuidv4 } from "uuid";

/**
 * Generate ASO Report Card for an app listing
 *
 * Process:
 * 1. Build context-aware prompt (LTR/RTL)
 * 2. Call Gemini with retry middleware
 * 3. Validate JSON response
 * 4. Transform into AsoReportCard
 * 5. Optionally save to database
 *
 * @param client - Gemini client instance
 * @param input - App listing metadata
 * @param options - Configuration options
 * @returns Complete AsoReportCard
 *
 * @example
 * ```typescript
 * const report = await generateAsoReportCard(client, {
 *   appId: "app123",
 *   appName: "My App",
 *   title: "Amazing App for Productivity",
 *   shortDescription: "Get things done fast",
 *   fullDescription: "...",
 *   locale: "en",
 *   category: "productivity",
 *   targetKeywords: ["productivity", "todo", "tasks"]
 * });
 *
 * console.log(`Overall Score: ${report.overallScore}`);
 * report.actionableTips.forEach(tip => {
 *   console.log(`[${tip.priority}] ${tip.action}`);
 * });
 * ```
 */
export async function generateAsoReportCard(
  client: GoogleGenerativeAI,
  input: AsoListingInput,
  options?: {
    debug?: boolean;
    maxRetries?: number;
  }
): Promise<AsoReportCard> {
  const startTime = Date.now();

  try {
    // Step 1: Build prompt
    const prompt = buildAsoAnalysisPrompt(input);

    if (options?.debug) {
      console.log("[ASO] Prompt built", { locale: input.locale, appName: input.appName });
    }

    // Step 2: Call Gemini with retry
    const model = client.getGenerativeModel({ model: "gemini-pro" });

    const retryResult = await callGeminiWithRetry(
      () =>
        model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 4000,
            temperature: 0.3, // Low temp for consistency
          },
        }),
      {
        maxRetries: options?.maxRetries ?? 3,
        debug: options?.debug,
      }
    );

    if (!retryResult.success) {
      throw new Error(`Gemini API failed: ${retryResult.lastError}`);
    }

    // Step 3: Extract and parse JSON
    const rawText = retryResult.data.response.text();
    const jsonString = extractJsonFromResponse(rawText);

    if (options?.debug) {
      console.log("[ASO] Gemini response received", { length: jsonString.length });
    }

    // Step 4: Verify response format
    const validation = verifyAnalysisResponse(jsonString);
    if (!validation.valid) {
      console.error("[ASO] Response validation failed", validation.errors);
      throw new Error(
        `Invalid Gemini response: ${validation.errors.join("; ")}`
      );
    }

    // Step 5: Parse JSON
    const analysisResponse = JSON.parse(jsonString) as GeminiAsoAnalysisResponse;

    // Step 6: Transform into AsoReportCard
    const report: AsoReportCard = {
      id: uuidv4(),
      appId: input.appId,
      appName: input.appName,
      locale: input.locale,
      createdAt: new Date().toISOString(),
      version: "1.0",

      overallScore: analysisResponse.overallScore,
      overallCategory: categorizeScore(analysisResponse.overallScore),

      readability: analysisResponse.readabilityScore,
      keywordDensity: analysisResponse.keywordDensityScore,
      conversionPotential: analysisResponse.conversionPotentialScore,

      actionableTips: analysisResponse.actionableTips,

      marketInsights: analysisResponse.marketInsights,

      nextSteps: analysisResponse.nextSteps,

      metadata: {
        generatedBy: "gemini-pro",
        promptVersion: 1,
        analysisTimeMs: Date.now() - startTime,
        confidence: determineConfidence(analysisResponse),
      },
    };

    if (options?.debug) {
      console.log("[ASO] Report generated successfully", {
        overallScore: report.overallScore,
        timeMs: report.metadata.analysisTimeMs,
      });
    }

    return report;
  } catch (error) {
    console.error("[ASO] Report generation failed", error);
    throw error;
  }
}

/**
 * Generate report card for app using existing listing_generations context
 *
 * This function ties into your existing listing optimizer data,
 * ensuring the ASO report is aware of previous optimizations.
 *
 * @param client - Gemini client
 * @param appId - App ID
 * @param currentListing - Current listing metadata
 * @param previousGeneration - Optional: Context from listing_generations table
 * @param locale - Target locale
 * @returns AsoReportCard
 */
export async function generateAsoReportCardWithContext(
  client: GoogleGenerativeAI,
  appId: string,
  currentListing: {
    title: string;
    shortDescription: string;
    fullDescription: string;
    appName: string;
    category?: string;
  },
  previousGeneration?: {
    title?: string;
    shortDescription?: string;
    fullDescription?: string;
    strategySummary?: string;
    keywordSuggestions?: string[];
  },
  locale: string = "en"
): Promise<AsoReportCard> {
  const input: AsoListingInput = {
    appId,
    appName: currentListing.appName,
    title: currentListing.title,
    shortDescription: currentListing.shortDescription,
    fullDescription: currentListing.fullDescription,
    category: currentListing.category,
    locale,
    previousGenerationContext: previousGeneration,
  };

  return generateAsoReportCard(client, input, { debug: true });
}

/**
 * Validate a report card structure
 */
export function validateReportCard(report: unknown): ReportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!report || typeof report !== "object") {
    errors.push("Report must be an object");
    return { valid: false, errors, warnings, scoreConsistency: "valid" };
  }

  const r = report as Record<string, unknown>;

  // Required fields
  if (typeof r.overallScore !== "number") errors.push("Missing overallScore");
  if (typeof r.appId !== "string") errors.push("Missing appId");
  if (typeof r.locale !== "string") errors.push("Missing locale");

  // Score validation
  const scores = [r.overallScore];
  let scoreConsistency: "valid" | "warning" = "valid";

  if (typeof r.readability === "object" && r.readability) {
    const rs = r.readability as Record<string, unknown>;
    if (typeof rs.score === "number") scores.push(rs.score);
  }

  if (typeof r.keywordDensity === "object" && r.keywordDensity) {
    const ks = r.keywordDensity as Record<string, unknown>;
    if (typeof ks.score === "number") scores.push(ks.score);
  }

  if (typeof r.conversionPotential === "object" && r.conversionPotential) {
    const cs = r.conversionPotential as Record<string, unknown>;
    if (typeof cs.score === "number") scores.push(cs.score);
  }

  // Check all scores are 1-100
  scores.forEach((score) => {
    if (typeof score !== "number" || score < 1 || score > 100) {
      scoreConsistency = "warning";
      warnings.push(`Score out of range 1-100: ${score}`);
    }
  });

  // Actionable tips validation
  if (!Array.isArray(r.actionableTips)) {
    errors.push("actionableTips must be an array");
  } else if (r.actionableTips.length !== 3) {
    errors.push(
      `actionableTips must have exactly 3 items, got ${r.actionableTips.length}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    scoreConsistency,
  };
}

/**
 * Helper: Categorize a score (1-100) into a readable category
 */
function categorizeScore(score: number): "excellent" | "good" | "fair" | "poor" {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "poor";
}

/**
 * Helper: Determine confidence level based on response consistency
 */
function determineConfidence(response: GeminiAsoAnalysisResponse): "high" | "medium" | "low" {
  // If all scores are in reasonable range and factors are present, high confidence
  const scoresInRange =
    response.readabilityScore.score >= 1 &&
    response.readabilityScore.score <= 100 &&
    response.keywordDensityScore.score >= 1 &&
    response.keywordDensityScore.score <= 100 &&
    response.conversionPotentialScore.score >= 1 &&
    response.conversionPotentialScore.score <= 100;

  const hasFactors =
    response.readabilityScore.factors?.length > 0 &&
    response.keywordDensityScore.factors?.length > 0 &&
    response.conversionPotentialScore.factors?.length > 0;

  const hasTips =
    response.actionableTips?.length === 3 &&
    response.actionableTips.every((t) => t.action && t.rationale);

  if (scoresInRange && hasFactors && hasTips) return "high";
  if (scoresInRange && hasFactors) return "medium";
  return "low";
}

/**
 * Compare two reports to measure improvement
 * Useful for tracking optimization progress
 */
export function compareReports(
  previousReport: AsoReportCard,
  currentReport: AsoReportCard
): {
  overallImprovement: number;
  readabilityImprovement: number;
  keywordImprovement: number;
  conversionImprovement: number;
  direction: "up" | "down" | "stable";
} {
  const overallImprovement =
    currentReport.overallScore - previousReport.overallScore;
  const readabilityImprovement =
    currentReport.readability.score - previousReport.readability.score;
  const keywordImprovement =
    currentReport.keywordDensity.score - previousReport.keywordDensity.score;
  const conversionImprovement =
    currentReport.conversionPotential.score -
    previousReport.conversionPotential.score;

  const direction =
    overallImprovement > 2 ? "up" : overallImprovement < -2 ? "down" : "stable";

  return {
    overallImprovement,
    readabilityImprovement,
    keywordImprovement,
    conversionImprovement,
    direction,
  };
}
