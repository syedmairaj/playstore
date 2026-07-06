/**
 * Shared types for pipeline progress tracking and partial/streaming UI.
 *
 * These flow from the status API → useListingPipeline → PipelineProgressShell
 * and DeploymentView, enabling fields to populate incrementally as each phase
 * completes (title after ~15s, short after ~30s, long after ~60s).
 */

/**
 * Partial content read from workspace_listing_drafts.modular_listing as each
 * pipeline phase writes its result.  Fields are null until the corresponding
 * phase completes.
 */
export type PartialListingContent = {
  /** Populated after the "title" phase (~15s). */
  title: string | null;
  /** Populated after the "short" phase (~30s). */
  shortDescription: string | null;
  /** Assembled hook + features + closing; populated after "long" phase (~60s). */
  longDescription: string | null;
};

export type PipelineStepStatus = "pending" | "active" | "done";

/** One step in the 4-stage pipeline progress indicator. */
export type PipelinePhaseStep = {
  phase: "title" | "short" | "long" | "full";
  /** EN label shown under the step dot. */
  label: string;
  /** AR label shown under the step dot (for RTL locale). */
  labelAr: string;
  status: PipelineStepStatus;
};

/**
 * Props passed to any component rendering in "build mode" —
 * the optimistic/streaming UI shown while a pipeline job is in flight.
 */
export type BuildMode = {
  isBuilding: true;
  /** 0–100 progress estimate derived from completed phases. */
  progressPercent: number;
  /** Which DB phase is actively executing. */
  currentPhase: string | null;
  /** Partial content available so far (null fields = still generating). */
  partialContent: PartialListingContent;
  /** The ListingVersion placeholder id (returned by POST /generate before 202). */
  versionId?: string;
};

/** Sentinel value for "not in build mode" — keeps prop shapes discriminated. */
export type IdleMode = { isBuilding: false };

export type BuildOrIdleMode = BuildMode | IdleMode;

/** Empty initial partial content. */
export const EMPTY_PARTIAL_CONTENT: PartialListingContent = {
  title: null,
  shortDescription: null,
  longDescription: null,
};

/**
 * Derive step indicators from the phase progress booleans and currentPhase.
 */
export function buildPipelineSteps(
  phases: { title: boolean; short: boolean; long: boolean; full: boolean },
  currentPhase: string | null,
): PipelinePhaseStep[] {
  function status(
    phase: PipelinePhaseStep["phase"],
    done: boolean,
  ): PipelineStepStatus {
    if (done) return "done";
    if (currentPhase === phase) return "active";
    return "pending";
  }

  return [
    {
      phase: "title",
      label: "Title",
      labelAr: "العنوان",
      status: status("title", phases.title),
    },
    {
      phase: "short",
      label: "Short",
      labelAr: "الوصف القصير",
      status: status("short", phases.short),
    },
    {
      phase: "long",
      label: "Long",
      labelAr: "الوصف الطويل",
      status: status("long", phases.long),
    },
    {
      phase: "full",
      label: "Done",
      labelAr: "اكتمل",
      status: status("full", phases.full),
    },
  ];
}

/**
 * Map the four-phase progress into an accurate 0–100 percentage.
 *
 *   Queued:          5%
 *   title done:     30%
 *   short done:     55%
 *   long done:      80%
 *   full/completed: 100%
 *
 * A +5 "active" bump is applied when the currentPhase matches a non-done step,
 * giving the impression of live movement without lying about progress.
 */
export function computeDetailedProgress(
  phases: { title: boolean; short: boolean; long: boolean; full: boolean },
  currentPhase: string | null,
  status: "idle" | "queued" | "processing" | "completed" | "error" | "stale" | "waiting",
): number {
  if (status === "idle") return 0;
  if (status === "completed") return 100;
  if (status === "error" || status === "stale") return 0;

  const milestones: [keyof typeof phases, number][] = [
    ["title", 30],
    ["short", 55],
    ["long", 80],
    ["full", 100],
  ];

  let base = 5;
  for (const [phase, pct] of milestones) {
    if (phases[phase]) base = pct;
  }

  // Active-phase +5 "movement" nudge
  if (currentPhase && base < 95) {
    const activePhaseIdx = milestones.findIndex(([p]) => p === currentPhase);
    if (activePhaseIdx >= 0 && !phases[milestones[activePhaseIdx][0]]) {
      base = Math.min(base + 5, 95);
    }
  }

  return base;
}
