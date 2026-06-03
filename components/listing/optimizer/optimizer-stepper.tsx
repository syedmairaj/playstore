"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type OptimizerWizardStep = 0 | 1 | 2;

type Props = {
  currentStep: OptimizerWizardStep;
  onStepChange: (step: OptimizerWizardStep) => void;
  labels: [string, string, string];
  ariaLabel: string;
  stepStatusLabels: {
    completed: string;
    current: string;
    upcoming: string;
  };
  isRtl: boolean;
};

export function OptimizerStepper({
  currentStep,
  onStepChange,
  labels,
  ariaLabel,
  stepStatusLabels,
  isRtl,
}: Props) {
  const steps: OptimizerWizardStep[] = [0, 1, 2];

  return (
    <nav aria-label={ariaLabel} className="mb-10 w-full sm:mb-12">
      <ol
        className={cn(
          "flex w-full items-start justify-between",
          isRtl && "flex-row-reverse",
        )}
      >
        {steps.map((step, i) => {
          const active = currentStep === step;
          const done = currentStep > step;
          const statusLabel = done
            ? stepStatusLabels.completed
            : active
              ? stepStatusLabels.current
              : stepStatusLabels.upcoming;
          const showConnector = i < steps.length - 1;

          return (
            <li
              key={step}
              className={cn(
                "flex min-w-0 list-none items-start",
                showConnector ? "flex-1" : "shrink-0",
              )}
            >
              <StepNode
                step={step}
                index={i}
                active={active}
                done={done}
                label={labels[i]}
                statusLabel={statusLabel}
                onStepChange={onStepChange}
              />

              {showConnector ? (
                <StepConnector done={done} isRtl={isRtl} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepNode({
  step,
  index,
  active,
  done,
  label,
  statusLabel,
  onStepChange,
}: {
  step: OptimizerWizardStep;
  index: number;
  active: boolean;
  done: boolean;
  label: string;
  statusLabel: string;
  onStepChange: (step: OptimizerWizardStep) => void;
}) {
  return (
    <div className="flex w-[5.5rem] shrink-0 flex-col items-center gap-2.5 sm:w-[6.5rem] sm:gap-3">
      <button
        type="button"
        onClick={() => onStepChange(step)}
        aria-current={active ? "step" : undefined}
        aria-label={`${label}, ${statusLabel}`}
        className={cn(
          "group flex w-full flex-col items-center gap-2 rounded-xl px-1 py-1 text-center transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]",
          !active && !done && "hover:opacity-90",
        )}
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums transition sm:size-11",
            active
              ? "bg-emerald-500 text-white shadow-[0_0_0_4px_rgba(16,185,129,0.18),0_0_24px_-4px_rgba(52,211,153,0.55)]"
              : done
                ? "bg-emerald-500/20 text-emerald-200 ring-2 ring-emerald-500/35"
                : "bg-zinc-800/90 text-zinc-500 ring-1 ring-zinc-700/80",
          )}
          aria-hidden
        >
          {done ? (
            <Check className="size-4.5 stroke-[2.5] sm:size-5" />
          ) : (
            index + 1
          )}
        </span>
        <span
          className={cn(
            "w-full px-0.5 text-center text-[11px] font-semibold leading-snug tracking-tight sm:text-xs",
            active
              ? "text-white"
              : done
                ? "text-emerald-200/85"
                : "text-white/45",
          )}
        >
          {label}
        </span>
      </button>
    </div>
  );
}

function StepConnector({ done, isRtl }: { done: boolean; isRtl: boolean }) {
  return (
    <div
      className={cn(
        "mt-5 hidden h-0.5 min-w-[1rem] flex-1 self-start sm:block",
        done
          ? isRtl
            ? "bg-gradient-to-l from-emerald-500/70 to-emerald-500/20"
            : "bg-gradient-to-r from-emerald-500/70 to-emerald-500/20"
          : "bg-zinc-800",
      )}
      aria-hidden
    />
  );
}
