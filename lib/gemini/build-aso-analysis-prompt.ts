/**
 * ASO Report Card — Gemini Prompt Engineering
 *
 * Builds a precise prompt that generates structured, professional ASO insights.
 * Includes hard-clamp verification to prevent:
 * - Invalid scores (outside 1-100)
 * - Missing required fields
 * - JSON parsing errors
 * - Market-insensitive recommendations
 */

import type { AsoListingInput } from "./aso-report-card-types";

/**
 * Keywords to strip from prompts (hard-clamp verification)
 * Prevents Gemini from generating off-topic content
 */
const DANGEROUS_KEYWORDS = [
  "ignore",
  "override",
  "jailbreak",
  "bypass",
  "secret",
  "hidden",
  "disregard",
  "forget",
  "invalid",
  "error",
  "null",
  "undefined",
];

/**
 * Verify prompt contains no dangerous keywords
 */
function verifyPromptCleanliness(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();
  return !DANGEROUS_KEYWORDS.some((keyword) =>
    lowerPrompt.includes(keyword)
  );
}

/**
 * Build the ASO analysis prompt for Gemini
 * Returns structured JSON that can be parsed directly into AsoReportCard
 *
 * @param input - App listing metadata for analysis
 * @returns Complete prompt for Gemini API
 */
export function buildAsoAnalysisPrompt(input: AsoListingInput): string {
  const isRTL = input.locale === "ar" || input.locale === "he";
  const marketContext = isRTL ? "Arabic-speaking markets" : "English-speaking markets";

  const prompt = `You are a professional ASO (App Store Optimization) analyst specializing in ${marketContext}.

TASK: Analyze the following app listing and provide professional-grade ASO insights.

APP INFORMATION:
- App Name: ${input.appName}
- Category: ${input.category || "general"}
- Language: ${input.locale}
- Market: ${marketContext}

LISTING TO ANALYZE:
Title: "${input.title}"
Short Description: "${input.shortDescription}"
Full Description: "${input.fullDescription}"

${
  input.targetKeywords && input.targetKeywords.length > 0
    ? `\nTARGET KEYWORDS: ${input.targetKeywords.join(", ")}`
    : ""
}

${
  input.previousGenerationContext
    ? `\nCONTEXT (previous AI generation):
Strategy: ${input.previousGenerationContext.strategySummary || "N/A"}
Previous Keywords: ${(input.previousGenerationContext.keywordSuggestions || []).join(", ") || "N/A"}`
    : ""
}

SCORING REQUIREMENTS:
1. Readability Score (1-100):
   - Evaluate clarity, sentence structure, ease of understanding
   - Consider grade level appropriate for ${marketContext}
   - Assess whether title and description flow naturally
   - For RTL languages: Verify right-to-left reading flow is natural

2. Keyword Density Score (1-100):
   - Analyze how well target keywords are incorporated
   - Check for keyword balance (not stuffed, not sparse)
   - Evaluate keyword placement in title vs description
   - Consider language-specific keyword variations for ${input.locale}

3. Conversion Potential Score (1-100):
   - Assess narrative arc: Hook → Features → Social Proof → CTA
   - Evaluate emotional appeal and urgency
   - Analyze call-to-action clarity and strength
   - For ${marketContext}: Evaluate cultural relevance and appeal

ACTIONABLE TIPS REQUIREMENTS:
- Provide exactly 3 tips
- Each tip must have: priority (1-3), category, action, rationale, example, effort
- Prioritize by impact on ranking and user conversion
- Ensure tips are context-aware for ${marketContext}
- For RTL markets: Include any market-specific considerations

RESPONSE FORMAT (Valid JSON only):
\`\`\`json
{
  "overallScore": <number 1-100>,
  "readabilityScore": {
    "score": <number 1-100>,
    "category": "<excellent|good|fair|poor>",
    "explanation": "<brief explanation>",
    "factors": ["<factor1>", "<factor2>", "<factor3>"],
    "avgSentenceLength": <number>,
    "gradeLevel": <number>,
    "titleClarity": "<strong|adequate|weak>",
    "descriptionFlow": "<natural|functional|disjointed>"
  },
  "keywordDensityScore": {
    "score": <number 1-100>,
    "category": "<excellent|good|fair|poor>",
    "explanation": "<brief explanation>",
    "factors": ["<factor1>", "<factor2>"],
    "detectedKeywords": [
      {
        "keyword": "<keyword>",
        "frequency": <number>,
        "placement": ["title"|"shortDesc"|"fullDesc"]
      }
    ],
    "missingKeywords": ["<if any>"],
    "overEmphasizedKeywords": ["<if any>"],
    "keywordBalance": "<optimized|balanced|sparse|stuffed>"
  },
  "conversionPotentialScore": {
    "score": <number 1-100>,
    "category": "<excellent|good|fair|poor>",
    "explanation": "<brief explanation>",
    "factors": ["<factor1>", "<factor2>"],
    "narrativeArc": {
      "hasHook": <boolean>,
      "hasFeatures": <boolean>,
      "hasSocialProof": <boolean>,
      "hasCallToAction": <boolean>,
      "structure": "<strong|adequate|weak>"
    },
    "emotionalAppeal": "<compelling|adequate|weak>",
    "callToActionStrength": "<strong|present|missing>",
    "valuePropositionClarity": "<crystal-clear|clear|unclear>"
  },
  "actionableTips": [
    {
      "priority": <1|2|3>,
      "category": "<readability|keywords|conversion|structure>",
      "action": "<specific action to take>",
      "rationale": "<why this matters>",
      "example": "<concrete example or suggestion>",
      "effort": "<quick|medium|involved>"
    },
    {
      "priority": <1|2|3>,
      "category": "<readability|keywords|conversion|structure>",
      "action": "<specific action to take>",
      "rationale": "<why this matters>",
      "example": "<concrete example or suggestion>",
      "effort": "<quick|medium|involved>"
    },
    {
      "priority": <1|2|3>,
      "category": "<readability|keywords|conversion|structure>",
      "action": "<specific action to take>",
      "rationale": "<why this matters>",
      "example": "<concrete example or suggestion>",
      "effort": "<quick|medium|involved>"
    }
  ],
  "marketInsights": {
    "locale": "${input.locale}",
    "marketContext": "${marketContext}",
    "culturalNotes": "<any ${input.locale}-specific insights${isRTL ? ", RTL considerations" : ""}>",
    "competitorContext": "<how this compares to typical apps in the ${input.category || "general"} category>"
  },
  "nextSteps": {
    "immediate": "<highest priority action>",
    "shortTerm": "<follow up within a week>",
    "longTerm": "<ongoing optimization strategy>"
  }
}
\`\`\`

CRITICAL REQUIREMENTS:
1. ALL scores must be integers between 1 and 100 (inclusive)
2. NEVER use scores outside 1-100 range
3. Response must be valid JSON that can be parsed directly
4. All required fields must be present (no null values)
5. Actionable tips must be exactly 3 items
6. Each tip must have all required fields
7. For ${marketContext}: Ensure recommendations are culturally relevant
8. ${isRTL ? "For RTL language: Consider right-to-left reading flow and RTL-specific market dynamics" : "For LTR markets: Standard left-to-right optimization principles apply"}
9. Do NOT include any commentary outside the JSON block
10. Do NOT include markdown formatting, only the raw JSON object

VALIDATION CHECKLIST:
✓ Score validation: All scores 1-100
✓ Field completeness: All required fields present
✓ JSON validity: Response is parseable JSON
✓ Tip count: Exactly 3 actionable tips
✓ Locale awareness: Insights specific to ${input.locale}
✓ Market context: Recommendations for ${marketContext}
${isRTL ? "✓ RTL compliance: Considerations for right-to-left markets" : ""}

RESPOND WITH ONLY THE JSON OBJECT, NO ADDITIONAL TEXT.`;

  // Hard-clamp verification
  if (!verifyPromptCleanliness(prompt)) {
    throw new Error(
      "Prompt contains dangerous keywords that could trigger prompt injection"
    );
  }

  return prompt;
}

/**
 * Verify the response is a valid ASO analysis JSON
 * Catches common issues: missing fields, invalid scores, malformed JSON
 */
export function verifyAnalysisResponse(
  rawResponse: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Try to parse JSON
  let parsed;
  try {
    parsed = JSON.parse(rawResponse);
  } catch (e) {
    errors.push(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return { valid: false, errors };
  }

  // Validate required fields
  const requiredFields = [
    "overallScore",
    "readabilityScore",
    "keywordDensityScore",
    "conversionPotentialScore",
    "actionableTips",
    "marketInsights",
    "nextSteps",
  ];

  requiredFields.forEach((field) => {
    if (!(field in parsed)) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  // Validate score ranges
  if (
    typeof parsed.overallScore !== "number" ||
    parsed.overallScore < 1 ||
    parsed.overallScore > 100
  ) {
    errors.push(
      `overallScore must be 1-100, got ${parsed.overallScore}`
    );
  }

  ["readabilityScore", "keywordDensityScore", "conversionPotentialScore"].forEach(
    (scoreField) => {
      if (parsed[scoreField]?.score) {
        const score = parsed[scoreField].score;
        if (typeof score !== "number" || score < 1 || score > 100) {
          errors.push(`${scoreField}.score must be 1-100, got ${score}`);
        }
      }
    }
  );

  // Validate actionable tips (must be exactly 3)
  if (!Array.isArray(parsed.actionableTips)) {
    errors.push("actionableTips must be an array");
  } else if (parsed.actionableTips.length !== 3) {
    errors.push(
      `actionableTips must have exactly 3 items, got ${parsed.actionableTips.length}`
    );
  } else {
    parsed.actionableTips.forEach((tip, i) => {
      const requiredTipFields = [
        "priority",
        "category",
        "action",
        "rationale",
        "effort",
      ];
      requiredTipFields.forEach((field) => {
        if (!(field in tip)) {
          errors.push(
            `actionableTips[${i}] missing required field: ${field}`
          );
        }
      });

      if (tip.priority && ![1, 2, 3].includes(tip.priority)) {
        errors.push(
          `actionableTips[${i}].priority must be 1, 2, or 3, got ${tip.priority}`
        );
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract JSON from Gemini response (handles markdown code blocks)
 */
export function extractJsonFromResponse(rawResponse: string): string {
  // Try to extract from markdown code block
  const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }

  // Otherwise, assume entire response is JSON
  return rawResponse.trim();
}
