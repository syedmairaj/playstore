import { describe, expect, it } from "vitest";
import {
  buildOrchestratorProgress,
  deriveOptimizerWizardStep,
  incompletePrerequisiteStepNumbers,
  isFinalOptimizationLocked,
  orchestratorStepToWizardStep,
} from "@/lib/client/growth-orchestrator";

describe("buildOrchestratorProgress", () => {
  it("starts at app identity when nothing is configured", () => {
    const progress = buildOrchestratorProgress({
      appName: "",
      category: "",
      keywordsText: "",
      featuresText: "",
      hasTrackedKeywords: false,
      competitorSignalCount: 0,
      reviewSignalCount: 0,
      reviewAnalysisValid: false,
      hasListingOutput: false,
      optimizationQueueItems: [],
    });
    expect(progress.currentStepId).toBe("app_identity");
    expect(progress.currentStepIndex).toBe(0);
  });

  it("advances to final optimization when research steps are done", () => {
    const progress = buildOrchestratorProgress({
      appName: "snap",
      category: "Social",
      keywordsText: "friends, stories",
      featuresText: "Share photos",
      hasTrackedKeywords: true,
      competitorSignalCount: 2,
      reviewSignalCount: 1,
      reviewAnalysisValid: true,
      hasListingOutput: false,
      optimizationQueueItems: [],
    });
    expect(progress.currentStepId).toBe("final_optimization");
    expect(progress.completedCount).toBe(5);
  });
});

describe("isFinalOptimizationLocked", () => {
  it("locks until competitors and reviews are complete", () => {
    const progress = buildOrchestratorProgress({
      appName: "snap",
      category: "Social",
      keywordsText: "friends",
      featuresText: "share",
      hasTrackedKeywords: true,
      competitorSignalCount: 0,
      reviewSignalCount: 0,
      reviewAnalysisValid: false,
      hasListingOutput: false,
      optimizationQueueItems: [],
    });
    expect(isFinalOptimizationLocked(progress.steps)).toBe(true);
    expect(incompletePrerequisiteStepNumbers(progress.steps)).toEqual([3, 4]);
  });
});

describe("deriveOptimizerWizardStep", () => {
  it("opens market discovery when assemble is the current orchestrator step", () => {
    const progress = buildOrchestratorProgress({
      appName: "snap",
      category: "Social",
      keywordsText: "",
      featuresText: "",
      hasTrackedKeywords: true,
      competitorSignalCount: 2,
      reviewSignalCount: 1,
      reviewAnalysisValid: true,
      hasListingOutput: false,
      optimizationQueueItems: [],
    });
    expect(progress.currentStepId).toBe("market_discovery");
    expect(deriveOptimizerWizardStep(progress)).toBe(1);
  });

  it("opens market discovery when off-page research steps are still incomplete", () => {
    const progress = buildOrchestratorProgress({
      appName: "snap",
      category: "Social",
      keywordsText: "",
      featuresText: "",
      hasTrackedKeywords: false,
      competitorSignalCount: 0,
      reviewSignalCount: 0,
      reviewAnalysisValid: false,
      hasListingOutput: false,
      optimizationQueueItems: [],
    });
    expect(progress.currentStepId).toBe("research_keywords");
    expect(deriveOptimizerWizardStep(progress)).toBe(1);
  });

  it("opens final optimization when vault research is staged but discovery fields are empty", () => {
    const progress = buildOrchestratorProgress({
      appName: "snap",
      category: "Social",
      keywordsText: "",
      featuresText: "",
      hasTrackedKeywords: true,
      competitorSignalCount: 2,
      reviewSignalCount: 1,
      reviewAnalysisValid: true,
      hasListingOutput: false,
      optimizationQueueItems: [],
    });
    expect(progress.currentStepId).toBe("market_discovery");
    expect(
      deriveOptimizerWizardStep(progress, { hasActiveResearchContext: true }),
    ).toBe(2);
  });

  it("opens final optimization when a listing output exists", () => {
    const progress = buildOrchestratorProgress({
      appName: "snap",
      category: "Social",
      keywordsText: "friends",
      featuresText: "share",
      hasTrackedKeywords: true,
      competitorSignalCount: 2,
      reviewSignalCount: 1,
      reviewAnalysisValid: true,
      hasListingOutput: true,
      optimizationQueueItems: [],
    });
    expect(deriveOptimizerWizardStep(progress, { hasListingOutput: true })).toBe(2);
  });
});

describe("orchestratorStepToWizardStep", () => {
  it("maps optimizer-page steps to wizard indices", () => {
    expect(orchestratorStepToWizardStep("app_identity")).toBe(0);
    expect(orchestratorStepToWizardStep("market_discovery")).toBe(1);
    expect(orchestratorStepToWizardStep("final_optimization")).toBe(2);
    expect(orchestratorStepToWizardStep("research_keywords")).toBeNull();
  });
});
