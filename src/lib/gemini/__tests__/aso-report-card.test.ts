/**
 * Tests for ASO Report Card
 * Validates prompt generation, response parsing, and localization
 */

import {
  buildAsoAnalysisPrompt,
  verifyAnalysisResponse,
  extractJsonFromResponse,
} from "../build-aso-analysis-prompt";
import { validateReportCard } from "../generate-aso-report-card";
import type { AsoListingInput } from "../aso-report-card-types";

describe("ASO Report Card", () => {
  const sampleInput: AsoListingInput = {
    appId: "app123",
    appName: "My Productivity App",
    title: "Productivity Master - Tasks & Goals",
    shortDescription: "Get things done with AI-powered task management",
    fullDescription:
      "Productivity Master helps you organize tasks, set goals, and track progress with AI assistance. " +
      "Stay focused, build habits, and achieve your objectives. Used by 1M+ users worldwide.",
    targetKeywords: ["productivity", "task management", "goals", "todo"],
    category: "productivity",
    locale: "en",
  };

  const arabicInput: AsoListingInput = {
    ...sampleInput,
    locale: "ar",
    title: "سيد الإنتاجية - المهام والأهداف",
    shortDescription: "أنجز أشياءك باستخدام إدارة المهام المدعومة بالذكاء الاصطناعي",
    fullDescription:
      "يساعدك سيد الإنتاجية على تنظيم المهام وتحديد الأهداف وتتبع التقدم بمساعدة الذكاء الاصطناعي. " +
      "ركز على عملك وبناء العادات وتحقيق أهدافك. يستخدمه أكثر من مليون مستخدم حول العالم.",
  };

  describe("buildAsoAnalysisPrompt", () => {
    it("builds prompt for English (LTR) input", () => {
      const prompt = buildAsoAnalysisPrompt(sampleInput);

      expect(prompt).toContain("English-speaking markets");
      expect(prompt).not.toContain("RTL");
      expect(prompt).toContain("overallScore");
      expect(prompt).toContain("readabilityScore");
      expect(prompt).toContain("keywordDensityScore");
      expect(prompt).toContain("conversionPotentialScore");
    });

    it("builds prompt for Arabic (RTL) input", () => {
      const prompt = buildAsoAnalysisPrompt(arabicInput);

      expect(prompt).toContain("Arabic-speaking markets");
      expect(prompt).toContain("RTL");
      expect(prompt).toContain("right-to-left");
      expect(prompt).toContain(arabicInput.title);
    });

    it("includes target keywords in prompt", () => {
      const prompt = buildAsoAnalysisPrompt(sampleInput);

      expect(prompt).toContain("TARGET KEYWORDS");
      expect(prompt).toContain("productivity");
      expect(prompt).toContain("task management");
    });

    it("includes previous generation context if provided", () => {
      const inputWithContext: AsoListingInput = {
        ...sampleInput,
        previousGenerationContext: {
          strategySummary: "Position as productivity leader",
          keywordSuggestions: ["productivity", "automation", "efficiency"],
        },
      };

      const prompt = buildAsoAnalysisPrompt(inputWithContext);

      expect(prompt).toContain("CONTEXT");
      expect(prompt).toContain("productivity leader");
      expect(prompt).toContain("automation");
    });

    it("prompt is clean (no dangerous keywords)", () => {
      const prompt = buildAsoAnalysisPrompt(sampleInput);

      const dangerousTerms = ["ignore", "override", "jailbreak", "bypass"];
      dangerousTerms.forEach((term) => {
        expect(prompt.toLowerCase()).not.toContain(term);
      });
    });

    it("prompt specifies JSON output format", () => {
      const prompt = buildAsoAnalysisPrompt(sampleInput);

      expect(prompt).toContain("RESPONSE FORMAT");
      expect(prompt).toContain("Valid JSON only");
      expect(prompt).toContain("```json");
    });

    it("prompt includes validation checklist", () => {
      const prompt = buildAsoAnalysisPrompt(sampleInput);

      expect(prompt).toContain("VALIDATION CHECKLIST");
      expect(prompt).toContain("Score validation");
      expect(prompt).toContain("Field completeness");
    });
  });

  describe("verifyAnalysisResponse", () => {
    const validResponse = {
      overallScore: 78,
      readabilityScore: {
        score: 80,
        category: "excellent",
        explanation: "Clear and well-written",
        factors: ["Simple sentences", "Strong hook"],
        avgSentenceLength: 12,
        gradeLevel: 6,
        titleClarity: "strong",
        descriptionFlow: "natural",
      },
      keywordDensityScore: {
        score: 72,
        category: "good",
        explanation: "Good keyword balance",
        factors: ["Keywords in title", "Natural distribution"],
        detectedKeywords: [
          { keyword: "productivity", frequency: 3, placement: ["title", "fullDesc"] },
        ],
        keywordBalance: "balanced",
      },
      conversionPotentialScore: {
        score: 75,
        category: "good",
        explanation: "Compelling narrative",
        factors: ["Strong hook", "Social proof"],
        narrativeArc: {
          hasHook: true,
          hasFeatures: true,
          hasSocialProof: true,
          hasCallToAction: true,
          structure: "strong",
        },
        emotionalAppeal: "compelling",
        callToActionStrength: "strong",
        valuePropositionClarity: "clear",
      },
      actionableTips: [
        {
          priority: 1,
          category: "readability",
          action: "Simplify technical jargon",
          rationale: "Users prefer simple language",
          example: "Change 'synergistic workflow' to 'easy task management'",
          effort: "quick",
        },
        {
          priority: 2,
          category: "keywords",
          action: "Add 'automation' keyword",
          rationale: "High search volume, low competition",
          example: "In description: 'automation features'",
          effort: "quick",
        },
        {
          priority: 3,
          category: "conversion",
          action: "Add numbers to proof",
          rationale: "Specific numbers increase credibility",
          example: "Change '1M+ users' to 'Trusted by 1.2M+ users'",
          effort: "quick",
        },
      ],
      marketInsights: {
        locale: "en",
        marketContext: "English-speaking markets",
      },
      nextSteps: {
        immediate: "Simplify language",
        shortTerm: "Add automation keyword",
        longTerm: "A/B test different value props",
      },
    };

    it("validates correct response", () => {
      const result = verifyAnalysisResponse(JSON.stringify(validResponse));
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("rejects invalid JSON", () => {
      const result = verifyAnalysisResponse("{invalid json}");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Invalid JSON");
    });

    it("detects missing required fields", () => {
      const incomplete = { ...validResponse };
      delete (incomplete as any).actionableTips;

      const result = verifyAnalysisResponse(JSON.stringify(incomplete));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("actionableTips"))).toBe(true);
    });

    it("validates score ranges", () => {
      const badScores = {
        ...validResponse,
        overallScore: 150, // Out of range
      };

      const result = verifyAnalysisResponse(JSON.stringify(badScores));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("1-100"))).toBe(true);
    });

    it("validates exactly 3 actionable tips", () => {
      const twoTips = {
        ...validResponse,
        actionableTips: validResponse.actionableTips.slice(0, 2),
      };

      const result = verifyAnalysisResponse(JSON.stringify(twoTips));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("exactly 3"))).toBe(true);
    });

    it("detects missing tip fields", () => {
      const badTips = {
        ...validResponse,
        actionableTips: [
          {
            priority: 1,
            category: "readability",
            // Missing: action, rationale, effort
          },
          validResponse.actionableTips[1],
          validResponse.actionableTips[2],
        ],
      };

      const result = verifyAnalysisResponse(JSON.stringify(badTips));
      expect(result.valid).toBe(false);
    });
  });

  describe("extractJsonFromResponse", () => {
    it("extracts JSON from markdown code block", () => {
      const response = `Some explanation\n\`\`\`json\n{"test": true}\n\`\`\`\nMore text`;
      const json = extractJsonFromResponse(response);
      expect(json).toBe('{"test": true}');
    });

    it("extracts JSON from code block without language tag", () => {
      const response = `\`\`\`\n{"test": true}\n\`\`\``;
      const json = extractJsonFromResponse(response);
      expect(json).toBe('{"test": true}');
    });

    it("returns raw input if no code block", () => {
      const response = '{"test": true}';
      const json = extractJsonFromResponse(response);
      expect(json).toBe('{"test": true}');
    });

    it("trims whitespace", () => {
      const response = `\n\n{"test": true}\n\n`;
      const json = extractJsonFromResponse(response);
      expect(json).toBe('{"test": true}');
    });
  });

  describe("validateReportCard", () => {
    const validReport = {
      id: "report-123",
      appId: "app123",
      appName: "Test App",
      locale: "en",
      createdAt: new Date().toISOString(),
      version: "1.0",
      overallScore: 75,
      overallCategory: "good",
      readability: {
        score: 80,
        category: "excellent",
        explanation: "Good",
        factors: ["test"],
        avgSentenceLength: 12,
        gradeLevel: 6,
        titleClarity: "strong",
        descriptionFlow: "natural",
      },
      keywordDensity: {
        score: 70,
        category: "good",
        explanation: "Good",
        factors: ["test"],
        detectedKeywords: [],
        keywordBalance: "balanced",
      },
      conversionPotential: {
        score: 75,
        category: "good",
        explanation: "Good",
        factors: ["test"],
        narrativeArc: {
          hasHook: true,
          hasFeatures: true,
          hasSocialProof: true,
          hasCallToAction: true,
          structure: "strong",
        },
        emotionalAppeal: "compelling",
        callToActionStrength: "strong",
        valuePropositionClarity: "clear",
      },
      actionableTips: [
        {
          priority: 1,
          category: "readability",
          action: "Test",
          rationale: "Test",
          effort: "quick",
        },
        {
          priority: 2,
          category: "keywords",
          action: "Test",
          rationale: "Test",
          effort: "quick",
        },
        {
          priority: 3,
          category: "conversion",
          action: "Test",
          rationale: "Test",
          effort: "quick",
        },
      ],
      marketInsights: {
        locale: "en",
        marketContext: "English-speaking markets",
      },
      nextSteps: {
        immediate: "Test",
        shortTerm: "Test",
        longTerm: "Test",
      },
      metadata: {
        generatedBy: "gemini-pro",
        promptVersion: 1,
        analysisTimeMs: 1000,
        confidence: "high",
      },
    };

    it("validates correct report card", () => {
      const result = validateReportCard(validReport);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("rejects report with missing fields", () => {
      const incomplete = { ...validReport };
      delete (incomplete as any).overallScore;

      const result = validateReportCard(incomplete);
      expect(result.valid).toBe(false);
    });

    it("detects out-of-range scores", () => {
      const badReport = {
        ...validReport,
        overallScore: 150,
      };

      const result = validateReportCard(badReport);
      expect(result.scoreConsistency).toBe("warning");
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("RTL/LTR Localization", () => {
    it("English prompt has no RTL-specific language", () => {
      const prompt = buildAsoAnalysisPrompt(sampleInput);
      expect(prompt.toLowerCase()).not.toContain("rtl language");
    });

    it("Arabic prompt includes RTL considerations", () => {
      const prompt = buildAsoAnalysisPrompt(arabicInput);
      expect(prompt).toContain("RTL");
      expect(prompt.toLowerCase()).toContain(
        "right-to-left"
      );
    });

    it("market context differs by locale", () => {
      const enPrompt = buildAsoAnalysisPrompt(sampleInput);
      const arPrompt = buildAsoAnalysisPrompt(arabicInput);

      expect(enPrompt).toContain("English-speaking markets");
      expect(arPrompt).toContain("Arabic-speaking markets");
    });
  });
});
