import { hasConfiguredDiscoveryInputs } from "@/lib/client/app-discovery-context";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";
import { assessVaultSynthesisReadiness } from "@/lib/optimization-queue/vault-synthesis-preflight";

export type OrchestratorStepId =
  | "app_identity"
  | "research_keywords"
  | "analyze_competitors"
  | "audit_reviews"
  | "market_discovery"
  | "final_optimization";

export const ORCHESTRATOR_STEP_ORDER: OrchestratorStepId[] = [
  "app_identity",
  "research_keywords",
  "analyze_competitors",
  "audit_reviews",
  "market_discovery",
  "final_optimization",
];

export type OrchestratorStepState = {
  id: OrchestratorStepId;
  complete: boolean;
};

export type OrchestratorProgress = {
  steps: OrchestratorStepState[];
  currentStepId: OrchestratorStepId;
  currentStepIndex: number;
  completedCount: number;
};

export type OrchestratorContextInput = {
  appName: string;
  category: string;
  keywordsText: string;
  featuresText: string;
  hasTrackedKeywords: boolean;
  competitorSignalCount: number;
  reviewSignalCount: number;
  reviewAnalysisValid: boolean;
  hasListingOutput: boolean;
  optimizationQueueItems: OptimizationQueueItem[];
};

const PREREQUISITE_FINAL_STEPS: OrchestratorStepId[] = [
  "analyze_competitors",
  "audit_reviews",
];

export function buildOrchestratorProgress(
  input: OrchestratorContextInput,
): OrchestratorProgress {
  const readiness = assessVaultSynthesisReadiness(input.optimizationQueueItems);
  const hasCompetitorContext =
    input.competitorSignalCount > 0 || readiness.hasCompetitors;
  const hasReviewContext =
    input.reviewAnalysisValid ||
    input.reviewSignalCount > 0 ||
    readiness.reviewCount > 0;
  const hasIdentity =
    Boolean(input.appName.trim()) && Boolean(input.category.trim());
  const hasDiscovery = hasConfiguredDiscoveryInputs(
    input.keywordsText,
    input.featuresText,
  );

  const steps: OrchestratorStepState[] = [
    { id: "app_identity", complete: hasIdentity },
    { id: "research_keywords", complete: input.hasTrackedKeywords },
    { id: "analyze_competitors", complete: hasCompetitorContext },
    { id: "audit_reviews", complete: hasReviewContext },
    { id: "market_discovery", complete: hasDiscovery },
    { id: "final_optimization", complete: input.hasListingOutput },
  ];

  const firstIncomplete = steps.find((s) => !s.complete);
  const currentStepId = firstIncomplete?.id ?? "final_optimization";
  const currentStepIndex = ORCHESTRATOR_STEP_ORDER.indexOf(currentStepId);

  return {
    steps,
    currentStepId,
    currentStepIndex: currentStepIndex >= 0 ? currentStepIndex : steps.length - 1,
    completedCount: steps.filter((s) => s.complete).length,
  };
}

export function isFinalOptimizationLocked(
  steps: OrchestratorStepState[],
): boolean {
  const stepMap = new Map(steps.map((s) => [s.id, s.complete]));
  return PREREQUISITE_FINAL_STEPS.some((id) => stepMap.get(id) !== true);
}

export function incompletePrerequisiteStepNumbers(
  steps: OrchestratorStepState[],
): number[] {
  const stepMap = new Map(steps.map((s) => [s.id, s.complete]));
  return PREREQUISITE_FINAL_STEPS.filter((id) => stepMap.get(id) !== true).map(
    (id) => ORCHESTRATOR_STEP_ORDER.indexOf(id) + 1,
  );
}

export function isOptimizerPageStep(stepId: OrchestratorStepId): boolean {
  return (
    stepId === "app_identity" ||
    stepId === "market_discovery" ||
    stepId === "final_optimization"
  );
}

export function orchestratorStepToWizardStep(
  stepId: OrchestratorStepId,
): 0 | 1 | 2 | null {
  switch (stepId) {
    case "app_identity":
      return 0;
    case "market_discovery":
      return 1;
    case "final_optimization":
      return 2;
    default:
      return null;
  }
}

/**
 * Maps orchestrator progress to the on-page wizard panel (0–2).
 * Off-page steps (keywords, competitors, reviews) resolve to the highest
 * applicable optimizer step so refresh does not dump users back at App Identity.
 */
export function deriveOptimizerWizardStep(
  progress: OrchestratorProgress,
  options?: {
    hasListingOutput?: boolean;
    hasModularDraft?: boolean;
    hasActiveResearchContext?: boolean;
  },
): 0 | 1 | 2 {
  if (options?.hasListingOutput || options?.hasModularDraft) return 2;

  const onPageStep = orchestratorStepToWizardStep(progress.currentStepId);
  if (
    options?.hasActiveResearchContext &&
    (onPageStep === 1 || progress.currentStepId === "market_discovery")
  ) {
    return 2;
  }
  if (onPageStep !== null) return onPageStep;

  const byId = new Map(progress.steps.map((step) => [step.id, step.complete]));
  if (byId.get("market_discovery")) return 2;
  if (byId.get("app_identity")) return 1;
  return 0;
}

export type OptimizerWizardStepIndex = 0 | 1 | 2;

const WIZARD_STEP_KEY_PREFIX = "listing-optimizer-wizard-step:";

export function optimizerWizardStepStorageKey(
  workspaceId: string,
  appId: string,
): string {
  return `${WIZARD_STEP_KEY_PREFIX}${workspaceId.trim()}:${appId.trim()}`;
}

export function readOptimizerWizardStep(
  workspaceId: string,
  appId: string,
): OptimizerWizardStepIndex | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(
      optimizerWizardStepStorageKey(workspaceId, appId),
    );
    if (raw === "0" || raw === "1" || raw === "2") return Number(raw) as OptimizerWizardStepIndex;
  } catch {
    /* */
  }
  return null;
}

export function persistOptimizerWizardStep(
  workspaceId: string,
  appId: string,
  step: OptimizerWizardStepIndex,
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      optimizerWizardStepStorageKey(workspaceId, appId),
      String(step),
    );
  } catch {
    /* */
  }
}

export type DiscoveryWorkflowMode = "recommended" | "manual";

const WORKFLOW_MODE_KEY_PREFIX = "listing-discovery-workflow:";

export function discoveryWorkflowModeStorageKey(
  workspaceId: string,
  appId: string,
): string {
  return `${WORKFLOW_MODE_KEY_PREFIX}${workspaceId.trim()}:${appId.trim()}`;
}

export function readDiscoveryWorkflowMode(
  workspaceId: string,
  appId: string,
): DiscoveryWorkflowMode | null {
  if (typeof window === "undefined") return null;
  const key = discoveryWorkflowModeStorageKey(workspaceId, appId);
  try {
    const raw = localStorage.getItem(key);
    if (raw === "manual" || raw === "recommended") return raw;
  } catch {
    /* */
  }
  return null;
}

export function persistDiscoveryWorkflowMode(
  workspaceId: string,
  appId: string,
  mode: DiscoveryWorkflowMode,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      discoveryWorkflowModeStorageKey(workspaceId, appId),
      mode,
    );
  } catch {
    /* */
  }
}
