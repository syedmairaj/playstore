"use client";

import { useMemo, useState } from "react";
import { Check, Circle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ORCHESTRATOR_STEP_ORDER,
  type OrchestratorStepId,
} from "@/lib/client/growth-orchestrator";
import { OrchestratorStepIcon } from "@/components/listing/optimizer/orchestrator-step-icons";
import { CustomTooltip } from "@/components/listing/optimizer/custom-tooltip";

export type OrchestratorStepHint = {
  why: string;
};

export type OrchestratorTaskItem = {
  id: string;
  label: string;
  complete: boolean;
};

type Props = {
  steps: { id: OrchestratorStepId; complete: boolean }[];
  currentStepId: OrchestratorStepId;
  labels: Record<OrchestratorStepId, string>;
  stepHints: Record<OrchestratorStepId, OrchestratorStepHint>;
  taskLists: Partial<Record<OrchestratorStepId, OrchestratorTaskItem[]>>;
  taskListTitle: string;
  ariaLabel: string;
  formatLockedTooltip: (previousStep: string) => string;
  stepStatusLabels: {
    completed: string;
    current: string;
    upcoming: string;
    locked: string;
  };
  finalOptimizationLocked: boolean;
  isRtl: boolean;
  embedded?: boolean;
  onStepAction?: (stepId: OrchestratorStepId) => void;
  onLockedAttempt?: () => void;
};

function getUnlockPreviousStepLabel(
  stepId: OrchestratorStepId,
  stepMap: Map<OrchestratorStepId, boolean>,
  labels: Record<OrchestratorStepId, string>,
): string {
  const stepIndex = ORCHESTRATOR_STEP_ORDER.indexOf(stepId);
  for (let i = stepIndex - 1; i >= 0; i -= 1) {
    const previousId = ORCHESTRATOR_STEP_ORDER[i]!;
    if (stepMap.get(previousId) !== true) {
      return labels[previousId];
    }
  }
  const fallbackId = ORCHESTRATOR_STEP_ORDER[Math.max(0, stepIndex - 1)]!;
  return labels[fallbackId];
}

export function StepperContainer({
  steps,
  currentStepId,
  labels,
  stepHints,
  taskLists,
  taskListTitle,
  ariaLabel,
  formatLockedTooltip,
  stepStatusLabels,
  finalOptimizationLocked,
  isRtl,
  embedded = false,
  onStepAction,
  onLockedAttempt,
}: Props) {
  const [expandedTaskStep, setExpandedTaskStep] = useState<OrchestratorStepId | null>(
    null,
  );
  const stepMap = useMemo(
    () => new Map(steps.map((step) => [step.id, step.complete])),
    [steps],
  );
  const currentStepIndex = ORCHESTRATOR_STEP_ORDER.indexOf(currentStepId);

  function handleStepClick(stepId: OrchestratorStepId, locked: boolean) {
    if (locked) {
      onLockedAttempt?.();
      return;
    }
    const tasks = taskLists[stepId];
    if (tasks?.length) {
      setExpandedTaskStep((prev) => (prev === stepId ? null : stepId));
    } else {
      setExpandedTaskStep(null);
    }
    onStepAction?.(stepId);
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "w-full max-w-full overflow-visible",
        embedded
          ? "px-0 py-0"
          : "mb-8 rounded-2xl border border-white/[0.05] bg-gradient-to-b from-white/[0.03] to-transparent px-2 py-3 sm:mb-10 sm:px-4 sm:py-4 md:px-5 md:py-5",
      )}
    >
      <ol
        className={cn(
          "flex w-full flex-nowrap items-start justify-between gap-0",
          isRtl && "flex-row-reverse",
        )}
      >
        {ORCHESTRATOR_STEP_ORDER.map((stepId, index) => {
          const done = stepMap.get(stepId) === true;
          const isNext = currentStepId === stepId && !done;
          const locked =
            stepId === "final_optimization" && finalOptimizationLocked;
          const statusLabel = locked
            ? stepStatusLabels.locked
            : done
              ? stepStatusLabels.completed
              : isNext
                ? stepStatusLabels.current
                : stepStatusLabels.upcoming;
          const connectorVibrant =
            index < currentStepIndex ||
            (done && ORCHESTRATOR_STEP_ORDER[index + 1] === currentStepId);
          const showConnector = index < ORCHESTRATOR_STEP_ORDER.length - 1;
          const hint = stepHints[stepId];
          const tasks = taskLists[stepId];
          const taskOpen = expandedTaskStep === stepId;
          const previousStepLabel = getUnlockPreviousStepLabel(
            stepId,
            stepMap,
            labels,
          );
          const tooltipDescription = locked
            ? formatLockedTooltip(previousStepLabel)
            : hint.why;

          return (
            <li
              key={stepId}
              className={cn(
                "relative flex min-w-0 list-none items-start",
                showConnector ? "min-w-0 flex-1" : "shrink-0",
              )}
            >
              <div className="relative flex w-full min-w-0 flex-col items-center">
                <CustomTooltip
                  description={tooltipDescription}
                  ariaLabel={`${labels[stepId]}: ${tooltipDescription}`}
                  isRtl={isRtl}
                >
                  <button
                    type="button"
                    onClick={() => handleStepClick(stepId, locked)}
                    aria-current={isNext && !locked ? "step" : undefined}
                    aria-expanded={taskOpen ? true : undefined}
                    aria-disabled={locked ? true : undefined}
                    aria-label={`${labels[stepId]}, ${statusLabel}`}
                    className={cn(
                      "flex w-full min-w-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1 text-center transition sm:gap-1.5",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]",
                      locked ? "cursor-not-allowed" : "hover:opacity-95",
                    )}
                  >
                    <span
                      className={cn(
                        "relative flex size-8 shrink-0 items-center justify-center rounded-full sm:size-9 md:size-10",
                        locked
                          ? "bg-zinc-900 ring-1 ring-amber-500/30"
                          : done
                            ? "bg-emerald-500/12 ring-1 ring-emerald-500/35"
                            : isNext
                              ? "bg-emerald-500/10 ring-1 ring-emerald-500/40 orchestrator-next-glow"
                              : "bg-zinc-900 ring-1 ring-zinc-800",
                      )}
                    >
                      {locked ? (
                        <Lock
                          className="size-3.5 text-amber-300/85 sm:size-4"
                          aria-hidden
                        />
                      ) : (
                        <OrchestratorStepIcon
                          stepId={stepId}
                          className={cn(
                            "size-3.5 sm:size-4 md:size-[1.125rem]",
                            done
                              ? "text-emerald-300"
                              : isNext
                                ? "text-emerald-200"
                                : "text-zinc-400",
                          )}
                        />
                      )}
                      {done && !locked ? (
                        <span className="absolute -bottom-0.5 -end-0.5 flex size-3 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-zinc-950 sm:size-3.5">
                          <Check
                            className="size-1.5 stroke-[3] text-white sm:size-2"
                            aria-hidden
                          />
                        </span>
                      ) : null}
                    </span>
                    <span
                      title={labels[stepId]}
                      className={cn(
                        "flex w-full min-w-0 items-center justify-center gap-0.5 px-0.5 text-center font-semibold leading-tight tracking-tight",
                        "text-[clamp(0.4375rem,1.65vw,0.625rem)]",
                        locked
                          ? "text-amber-200/70"
                          : isNext
                            ? "text-white"
                            : done
                              ? "text-emerald-200/80"
                              : "text-white/40",
                      )}
                    >
                      <span className="min-w-0 truncate">{labels[stepId]}</span>
                      {locked ? (
                        <Lock
                          className="size-2 shrink-0 text-amber-300/80 sm:size-2.5"
                          aria-hidden
                        />
                      ) : null}
                    </span>
                  </button>
                </CustomTooltip>

                {taskOpen && tasks?.length ? (
                  <div
                    className={cn(
                      "absolute top-full z-40 mt-2 w-[min(13rem,70vw)] rounded-xl border border-zinc-700/80 bg-zinc-950/98 p-3 shadow-2xl backdrop-blur-sm",
                      isRtl ? "right-0 text-right" : "left-1/2 -translate-x-1/2 text-left",
                    )}
                  >
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-400/90">
                      {taskListTitle}
                    </p>
                    <ul className="space-y-1.5">
                      {tasks.map((task) => (
                        <li
                          key={task.id}
                          className={cn(
                            "flex items-start gap-2 text-[11px] leading-snug",
                            isRtl && "flex-row-reverse",
                          )}
                        >
                          {task.complete ? (
                            <Check
                              className="mt-0.5 size-3 shrink-0 text-emerald-400"
                              aria-hidden
                            />
                          ) : (
                            <Circle
                              className="mt-0.5 size-3 shrink-0 text-zinc-600"
                              aria-hidden
                            />
                          )}
                          <span
                            className={
                              task.complete ? "text-white/55" : "text-white/85"
                            }
                          >
                            {task.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              {showConnector ? (
                <OrchestratorConnector vibrant={connectorVibrant} isRtl={isRtl} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function OrchestratorConnector({
  vibrant,
  isRtl,
}: {
  vibrant: boolean;
  isRtl: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-[0.875rem] h-px min-w-[0.25rem] flex-1 self-start sm:mt-[1rem] md:mt-[1.125rem]",
        vibrant
          ? cn(
              "orchestrator-path-glow",
              isRtl
                ? "bg-gradient-to-l from-emerald-400/90 via-emerald-500/70 to-emerald-500/10"
                : "bg-gradient-to-r from-emerald-400/90 via-emerald-500/70 to-emerald-500/10",
            )
          : "bg-zinc-800/90",
      )}
      aria-hidden
    />
  );
}
