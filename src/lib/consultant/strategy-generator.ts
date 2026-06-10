/**
 * Strategy Generator — Consultant Layer Core
 *
 * Transforms ASO Report Card into 30-day executable Growth Roadmap.
 * Senior consultant tone, market benchmarked, task-oriented.
 */

import type { AsoReportCard } from "@/lib/gemini/aso-report-card-types";
import type {
  GrowthRoadmap,
  ConsultantScoreBreakdown,
  CompetitiveBenchmark,
} from "./consultant-types";
import { callGeminiWithRetry } from "@/lib/retry/gemini-retry";
import { v4 as uuidv4 } from "uuid";

/**
 * Build the strategy generation prompt
 * Senior consultant tone: directive, action-oriented, market-aware
 */
function buildStrategyPrompt(
  appName: string,
  category: string,
  asoReport: AsoReportCard,
  competitiveBenchmark?: CompetitiveBenchmark,
  locale: string = "en"
): string {
  const isRTL = locale === "ar" || locale === "he";
  const marketContext = isRTL ? "Arabic-speaking markets" : "English-speaking markets";

  const prompt = `You are a senior ASO (App Store Optimization) strategist with 15+ years of experience.

Your task: Transform the following ASO Report Card into a 30-day executable Growth Roadmap.

APP CONTEXT:
- Name: ${appName}
- Category: ${category}
- Market: ${marketContext}
- Current Consultant Score: ${calculateConsultantScore(asoReport)}/100

ASO REPORT CARD SUMMARY:
- Readability: ${asoReport.readability.score}/100 (${asoReport.readability.category})
- Keyword Density: ${asoReport.keywordDensity.score}/100 (${asoReport.keywordDensity.category})
- Conversion Potential: ${asoReport.conversionPotential.score}/100 (${asoReport.conversionPotential.category})

TOP ISSUES IDENTIFIED:
${asoReport.actionableTips
  .map((tip, i) => `${i + 1}. [P${tip.priority}] ${tip.action} - ${tip.rationale}`)
  .join("\n")}

${
  competitiveBenchmark
    ? `
COMPETITIVE CONTEXT:
- Your Consultant Score: ${competitiveBenchmark.userScore}
- Competitor 1: ${competitiveBenchmark.competitor1Score} (gap: ${competitiveBenchmark.competitor1Score - competitiveBenchmark.userScore})
- Competitor 2: ${competitiveBenchmark.competitor2Score}
- Competitor 3: ${competitiveBenchmark.competitor3Score}
- Category Average: ${competitiveBenchmark.categoryAverage}

Market Position: You are ${Math.max(1, Math.round((competitiveBenchmark.userScore / competitiveBenchmark.categoryAverage) * 10))}th percentile
`
    : ""
}

STRATEGIC REQUIREMENTS:
1. Create EXACTLY 4 weekly sprints (Week 1-4)
2. Each sprint must have 3-5 specific, actionable tactics
3. Sprints must be sequential (Week 1 enables Week 2, etc.)
4. Professional consultant tone: Directive, confident, action-oriented
5. For ${marketContext}: Use market-specific language and tactics
6. ${isRTL ? "For RTL: Ensure recommendations respect cultural nuances and reading patterns" : "For LTR markets: Standard optimization approach"}

SPRINT STRUCTURE (Template):
Week 1: Foundation - Address critical metadata/clarity issues
Week 2: Optimization - Keyword expansion and balance
Week 3: Testing - A/B test assets and messaging
Week 4: Scale - Solidify gains and plan for long-term growth

CONSULTANT TONE (MANDATORY):
- Be directive: "You must...", "The data clearly shows...", "We recommend..."
- Cite data: "Your readability score of ${asoReport.readability.score} indicates..."
- Use urgency: "With your ${competitiveBenchmark ? `${competitiveBenchmark.competitor1Score - competitiveBenchmark.userScore} point gap` : "current"} gap, immediate action is required."
- Professional authority: "As a senior strategist, I've seen similar apps..."
- Action-oriented: Every recommendation must be executable in <4 hours per week

RESPONSE FORMAT (Valid JSON only):
\`\`\`json
{
  "consultantScore": <number 1-100>,
  "growthTier": "<emerging|growing|scaling|dominance>",
  "strategicTheme": "<short title capturing the core strategy>",
  "executiveSummary": "<2-3 sentences from a senior consultant>",

  "sprints": [
    {
      "week": 1,
      "title": "<specific sprint focus>",
      "objective": "<what we're solving>",
      "rationale": "<why this week, why this order>",
      "tacticItems": [
        {
          "id": "tactic_1",
          "title": "<specific action>",
          "description": "<why this matters and expected impact>",
          "action": "<exactly what to do>",
          "implementationGuide": "<step-by-step if complex>",
          "metrics": {
            "currentValue": "<current state>",
            "targetValue": "<goal>",
            "measurementMethod": "<how to verify>",
            "linkedToReportInsight": "<reference to ASO report tip>"
          },
          "estimatedDurationMinutes": <number>,
          "category": "<metadata|keywords|assets|conversion|structure>"
        }
      ],
      "expectedImpact": {
        "readabilityIncrease": <number or null>,
        "keywordDensityIncrease": <number or null>,
        "conversionIncrease": <number or null>
      },
      "effort": "<light|medium|heavy>",
      "priority": <1-4>
    }
  ],

  "competitiveAnalysis": {
    "userConsultantScore": ${competitiveBenchmark?.userScore || calculateConsultantScore(asoReport)},
    "topCompetitor1": {
      "appName": "<competitor name>",
      "consultantScore": ${competitiveBenchmark?.competitor1Score || 75},
      "gaps": ["<specific gap 1>", "<specific gap 2>", "<specific gap 3>"]
    },
    "topCompetitor2": {
      "appName": "<competitor name>",
      "consultantScore": ${competitiveBenchmark?.competitor2Score || 72},
      "gaps": ["<gap 1>", "<gap 2>"]
    },
    "topCompetitor3": {
      "appName": "<competitor name>",
      "consultantScore": ${competitiveBenchmark?.competitor3Score || 68},
      "gaps": ["<gap 1>"]
    },
    "marketOpportunity": "<narrative: where you can win vs competitors>",
    "marketThreat": "<narrative: where you're vulnerable>"
  },

  "confidenceLevel": "<high|medium|low>"
}
\`\`\`

CRITICAL REQUIREMENTS:
1. Consultant Score must be 1-100 (composite: readability + keywords + conversion + competitive position)
2. All tactics must be specific and actionable in <4 hours/week
3. Sprints must be sequential and build on each other
4. Competitive gaps must reference actual ASO metrics (readability, keywords, conversion)
5. Market opportunity must be realistic and tied to category dynamics
6. For ${marketContext}: Recommendations must be culturally and linguistically appropriate
7. Do NOT include any commentary outside the JSON block

VALIDATION CHECKLIST:
✓ Exactly 4 sprints
✓ 3-5 tactics per sprint
✓ All tactics are specific and measurable
✓ Consultant Score 1-100
✓ Tone is senior/directive/action-oriented
✓ Competitive analysis references actual data
✓ Market context appropriate for ${marketContext}
✓ All required JSON fields present
✓ No markdown, pure JSON only

RESPOND WITH ONLY THE JSON OBJECT, NO ADDITIONAL TEXT.`;

  return prompt;
}

/**
 * Calculate Consultant Score from ASO Report
 * Composite metric: position vs. category leaders
 */
export function calculateConsultantScore(asoReport: AsoReportCard): number {
  // Weight the three scores
  const readabilityWeight = 0.3; // Clear listing = easier to optimize
  const keywordWeight = 0.35; // Keywords drive discovery
  const conversionWeight = 0.35; // Conversion drives conversions

  const weighted =
    asoReport.readability.score * readabilityWeight +
    asoReport.keywordDensity.score * keywordWeight +
    asoReport.conversionPotential.score * conversionWeight;

  // Apply category curve (some categories are naturally more competitive)
  // For now, assume neutral curve
  return Math.round(weighted);
}

/**
 * Generate Growth Roadmap from ASO Report Card
 *
 * @param client - Gemini client
 * @param appName - App name
 * @param category - App category
 * @param asoReport - The ASO Report Card
 * @param competitiveBenchmark - Optional competitive data
 * @param locale - Target locale
 * @returns Complete Growth Roadmap
 */
export async function generateGrowthRoadmap(
  client: GoogleGenerativeAI,
  appName: string,
  category: string,
  asoReport: AsoReportCard,
  competitiveBenchmark?: CompetitiveBenchmark,
  locale: string = "en"
): Promise<GrowthRoadmap> {
  const startTime = Date.now();

  try {
    // Step 1: Build prompt
    const prompt = buildStrategyPrompt(
      appName,
      category,
      asoReport,
      competitiveBenchmark,
      locale
    );

    // Step 2: Call Gemini with retry
    const model = client.getGenerativeModel({ model: "gemini-pro" });

    const retryResult = await callGeminiWithRetry(
      () =>
        model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 5000,
            temperature: 0.4, // Slightly higher than ASO report (more creative strategy)
          },
        }),
      { maxRetries: 3, debug: true }
    );

    if (!retryResult.success) {
      throw new Error(`Gemini failed: ${retryResult.lastError}`);
    }

    // Step 3: Extract and parse JSON
    const rawText = retryResult.data.response.text();
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonString = jsonMatch ? jsonMatch[1].trim() : rawText.trim();

    const response = JSON.parse(jsonString);

    // Step 4: Calculate total estimated duration
    const totalMinutes = response.sprints.reduce(
      (sum: number, sprint: any) =>
        sum +
        sprint.tacticItems.reduce(
          (sprintSum: number, tactic: any) => sprintSum + tactic.estimatedDurationMinutes,
          0
        ),
      0
    );

    // Step 5: Transform into GrowthRoadmap
    const roadmap: GrowthRoadmap = {
      id: uuidv4(),
      appId: asoReport.appId,
      workspaceId: "", // Will be set by caller
      locale,
      generatedFromReportId: asoReport.id,

      consultantScore: response.consultantScore,
      growthTier: response.growthTier,
      strategicTheme: response.strategicTheme,

      sprints: response.sprints,
      totalEstimatedDurationHours: Math.ceil(totalMinutes / 60),

      competitiveAnalysis: response.competitiveAnalysis,

      executiveSummary: response.executiveSummary,
      confidenceLevel: response.confidenceLevel,

      createdAt: new Date().toISOString(),
      version: "1.0",
    };

    return roadmap;
  } catch (error) {
    console.error("[Consultant] Roadmap generation failed", error);
    throw error;
  }
}

/**
 * Generate Consultant Score Breakdown
 * Detailed analysis of app's positioning
 */
export function analyzeConsultantScore(
  asoReport: AsoReportCard,
  competitiveBenchmark?: CompetitiveBenchmark
): ConsultantScoreBreakdown {
  const score = calculateConsultantScore(asoReport);

  // Determine tier
  let tier: "emerging" | "growing" | "scaling" | "dominance";
  if (score >= 85) tier = "dominance";
  else if (score >= 70) tier = "scaling";
  else if (score >= 55) tier = "growing";
  else tier = "emerging";

  // Component scores
  const readability = asoReport.readability.score;
  const keywords = asoReport.keywordDensity.score;
  const conversion = asoReport.conversionPotential.score;
  const competitive = competitiveBenchmark
    ? 100 - Math.min(100, Math.abs(competitiveBenchmark.userScore - competitiveBenchmark.competitor1Score) * 2)
    : 70;

  return {
    score,
    tier,
    readabilityAlignment: readability,
    keywordOptimization: keywords,
    conversionPotential: conversion,
    competitivePosition: competitive,

    strength:
      readability > keywords && readability > conversion
        ? "Clear, well-written listing"
        : keywords > readability && keywords > conversion
          ? "Strong keyword targeting"
          : "Compelling value proposition",

    weakness:
      readability < 50
        ? "Listing is unclear or poorly structured"
        : keywords < 50
          ? "Keywords not well optimized"
          : "Conversion narrative is weak",

    opportunity:
      keywords < 70
        ? "Significant keyword expansion opportunity (20-30 point gain possible)"
        : conversion < 70
          ? "Narrative restructuring could drive higher conversion"
          : "Market leadership within reach",

    threat:
      competitiveBenchmark && competitiveBenchmark.competitor1Score - competitiveBenchmark.userScore > 15
        ? "Competitors are significantly ahead; rapid action required"
        : "Steady progress needed to maintain position",

    recommendations: asoReport.actionableTips
      .filter((t) => t.priority === 1)
      .slice(0, 3)
      .map((t) => t.action),
  };
}
