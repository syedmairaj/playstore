import "server-only";

import type { ModularListingGenerationStep } from "@/lib/listing/modular-listing.types";
import type { ListingDraftPersistedPhases } from "@/lib/listing/listing-draft-persist.types";

export type ModularPhaseOrderCode =
  | "modular_phase_order_conflict"
  | "WAITING_FOR_PHASES";

export class ModularPhaseOrderError extends Error {
  readonly code: ModularPhaseOrderCode;
  readonly missingPhases: Array<"title" | "short" | "long">;

  constructor(
    missingPhases: Array<"title" | "short" | "long">,
    code: ModularPhaseOrderCode = "modular_phase_order_conflict",
  ) {
    const labels = missingPhases.join(" and ");
    const message =
      code === "WAITING_FOR_PHASES"
        ? "Pipeline phases are still processing"
        : `Generation blocked: complete the ${labels} phase(s) and wait for vault persistence before this step.`;
    super(message);
    this.name = "ModularPhaseOrderError";
    this.code = code;
    this.missingPhases = missingPhases;
  }
}

export type ModularPhaseGuardStep = ModularListingGenerationStep | "pipeline";

export type ModularPhaseOrderCheckResult =
  | { ok: true }
  | {
      ok: false;
      code: "WAITING_FOR_PHASES";
      missingPhases: Array<"title" | "short" | "long">;
      message: string;
    };

function missingForStep(
  step: ModularPhaseGuardStep,
  phases: ListingDraftPersistedPhases,
): Array<"title" | "short" | "long"> {
  const missing: Array<"title" | "short" | "long"> = [];

  if (step === "pipeline" || step === "title") {
    return missing;
  }

  if (step === "short" && !phases.title) {
    missing.push("title");
    return missing;
  }

  const needsTitleShort = new Set<ModularPhaseGuardStep>([
    "long",
    "hook",
    "features",
    "closing",
    "finalize",
  ]);

  if (needsTitleShort.has(step)) {
    if (!phases.title) missing.push("title");
    if (!phases.short) missing.push("short");
  }

  // Legacy `full` runs end-to-end Gemini synthesis — not the modular phase chain.
  const needsLong = new Set<ModularPhaseGuardStep>(["finalize"]);
  if (needsLong.has(step) && !phases.long) {
    if (!missing.includes("title") && !phases.title) missing.push("title");
    if (!missing.includes("short") && !phases.short) missing.push("short");
    missing.push("long");
  }

  return missing;
}

/**
 * Read-only phase-order check — returns a result object instead of throwing.
 * Producer routes use this (or orchestrator `executionMode: "read"`) before enqueue.
 */
export function checkModularPhaseOrder(params: {
  step: ModularPhaseGuardStep;
  persistedPhases: ListingDraftPersistedPhases;
  queueHash: string;
  isRegenerate?: boolean;
  skipGuard?: boolean;
}): ModularPhaseOrderCheckResult {
  if (params.skipGuard || params.isRegenerate || params.step === "pipeline") {
    return { ok: true };
  }

  const missing = missingForStep(params.step, params.persistedPhases);
  if (missing.length === 0) {
    return { ok: true };
  }

  console.warn(
    JSON.stringify({
      event: "modular_phase_order_pending",
      step: params.step,
      queueHash: params.queueHash,
      missingPhases: missing,
      persistedPhases: params.persistedPhases,
    }),
  );

  return {
    ok: false,
    code: "WAITING_FOR_PHASES",
    missingPhases: missing,
    message: "Pipeline phases are still processing",
  };
}

/**
 * Execute-path guard — throws `modular_phase_order_conflict` (worker / serial pipeline).
 */
export function assertModularPhaseOrder(params: {
  step: ModularPhaseGuardStep;
  persistedPhases: ListingDraftPersistedPhases;
  queueHash: string;
  isRegenerate?: boolean;
  skipGuard?: boolean;
}): void {
  const result = checkModularPhaseOrder(params);
  if (!result.ok) {
    throw new ModularPhaseOrderError(
      result.missingPhases,
      "modular_phase_order_conflict",
    );
  }
}
