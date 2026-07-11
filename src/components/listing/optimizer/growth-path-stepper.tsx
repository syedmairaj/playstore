"use client";

import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GrowthPathStepId } from "@/lib/client/listing-optimizer-growth-path";

export type GrowthPathStepperLabels = Record<GrowthPathStepId, string>;

export type GrowthPathStepHint = {
  whyThisMatters: string;
  quickAction: string;
};

type Props = {
  steps: { id: GrowthPathStepId; complete: boolean }[];
  currentStepId: GrowthPathStepId;
  labels: GrowthPathStepperLabels;
  stepHints: Record<GrowthPathStepId, GrowthPathStepHint>;
  ariaLabel: string;
  stepStatusLabels: {
    completed: string;
    current: string;
    upcoming: string;
    locked: string;
  };
  pulseAriaLabel: string;
  lockedMessage: string;
  generateListingLocked: boolean;
  isRtl: boolean;
  onStepAction?: (stepId: GrowthPathStepId) => void;
  onQuickAction?: (stepId: GrowthPathStepId) => void;
  onLockedGenerateAttempt?: () => void;
};

const STEP_ORDER: GrowthPathStepId[] = [
  "research_keywords",
  "analyze_competitors",
  "audit_reviews",
  "generate_listing",
];

export function GrowthPathStepper({
  steps,
  currentStepId,
  labels,
  stepHints,
  ariaLabel,
  stepStatusLabels,
  pulseAriaLabel,
  lockedMessage,
  generateListingLocked,
  isRtl,
  onStepAction,
  onQuickAction,
  onLockedGenerateAttempt,
}: Props) {
  const stepMap = new Map(steps.map((s) => [s.id, s.complete]));

  return (
    <nav
      aria-label={ariaLabel}
      className="w-full rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent p-4 sm:p-5"
    >
      <ol
        className={cn(
          "flex w-full items-start justify-between gap-1",
          isRtl && "flex-row-reverse",
        )}
      >
        {STEP_ORDER.map((stepId, i) => {
          const done = stepMap.get(stepId) === true;
          const active = currentStepId === stepId;
          const isGenerate = stepId === "generate_listing";
          const locked = isGenerate && generateListingLocked;
          const statusLabel = locked
            ? stepStatusLabels.locked
            : done
              ? stepStatusLabels.completed
              : active
                ? stepStatusLabels.current
                : stepStatusLabels.upcoming;
          const showConnector = i < STEP_ORDER.length - 1;
          const hint = stepHints[stepId];

          return (
            <li
              key={stepId}
              className={cn(
                "flex min-w-0 list-none items-start",
                showConnector ? "flex-1" : "shrink-0",
              )}
            >
              <GrowthPathNode
                stepId={stepId}
                index={i}
                active={active}
                done={done}
                locked={locked}
                label={labels[stepId]}
                statusLabel={statusLabel}
                hint={hint}
                pulseAriaLabel={pulseAriaLabel}
                lockedMessage={lockedMessage}
                isRtl={isRtl}
                onStepAction={onStepAction}
                onQuickAction={onQuickAction}
                onLockedGenerateAttempt={onLockedGenerateAttempt}
              />
              {showConnector ? (
                <GrowthPathConnector done={done} isRtl={isRtl} />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function GrowthPathNode({
  stepId,
  index,
  active,
  done,
  locked,
  label,
  statusLabel,
  hint,
  pulseAriaLabel,
  lockedMessage,
  isRtl,
  onStepAction,
  onQuickAction,
  onLockedGenerateAttempt,
}: {
  stepId: GrowthPathStepId;
  index: number;
  active: boolean;
  done: boolean;
  locked: boolean;
  label: string;
  statusLabel: string;
  hint: GrowthPathStepHint;
  pulseAriaLabel: string;
  lockedMessage: string;
  isRtl: boolean;
  onStepAction?: (stepId: GrowthPathStepId) => void;
  onQuickAction?: (stepId: GrowthPathStepId) => void;
  onLockedGenerateAttempt?: () => void;
}) {
  function handleStepClick() {
    if (locked) {
      onLockedGenerateAttempt?.();
      return;
    }
    onStepAction?.(stepId);
  }

  function handleQuickAction() {
    if (onQuickAction) {
      onQuickAction(stepId);
      return;
    }
    handleStepClick();
  }

  return (
    <div className="relative flex w-[5.25rem] shrink-0 flex-col items-center gap-2 sm:w-[6.25rem] sm:gap-2.5">
      <div className="relative flex w-full items-start justify-center">
        <button
          type="button"
          onClick={handleStepClick}
          aria-current={active && !locked ? "step" : undefined}
          aria-disabled={locked ? true : undefined}
          aria-label={`${label}, ${statusLabel}`}
          className={cn(
            "group/step flex w-full flex-col items-center gap-2 rounded-xl px-1 py-1 text-center transition",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0E14]",
            locked
              ? "cursor-not-allowed opacity-80"
              : "hover:opacity-90",
          )}
        >
          <span
            className={cn(
              "relative flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums transition sm:size-10 sm:text-sm",
              locked
                ? "bg-zinc-800/90 text-zinc-500 ring-2 ring-amber-500/35"
                : active
                  ? "bg-emerald-500 text-white shadow-[0_0_0_4px_rgba(16,185,129,0.18),0_0_20px_-4px_rgba(52,211,153,0.5)]"
                  : done
                    ? "bg-emerald-500/20 text-emerald-200 ring-2 ring-emerald-500/35"
                    : "bg-zinc-800/90 text-zinc-500 ring-1 ring-zinc-700/80",
            )}
          >
            {locked ? (
              <Lock className="size-3.5 sm:size-4" aria-hidden />
            ) : done ? (
              <Check className="size-4 stroke-[2.5] sm:size-4.5" aria-hidden />
            ) : (
              <span aria-hidden>{index + 1}</span>
            )}
            {!locked && !done ? (
              <span
                className="growth-path-pulse absolute inset-0 rounded-full"
                aria-hidden
              />
            ) : null}
          </span>
          <span
            className={cn(
              "w-full px-0.5 text-center text-[10px] font-semibold leading-snug tracking-tight sm:text-[11px]",
              locked
                ? "text-amber-200/75"
                : active
                  ? "text-white"
                  : done
                    ? "text-emerald-200/85"
                    : "text-white/45",
            )}
          >
            {label}
          </span>
        </button>

        <GrowthPathPulseNavigator
          hint={hint}
          locked={locked}
          lockedMessage={lockedMessage}
          pulseAriaLabel={pulseAriaLabel}
          isRtl={isRtl}
          onQuickAction={handleQuickAction}
        />
      </div>

      {locked ? (
        <p className="hidden px-1 text-center text-[9px] leading-snug text-amber-200/70 sm:block">
          {lockedMessage}
        </p>
      ) : null}
    </div>
  );
}

function GrowthPathPulseNavigator({
  hint,
  locked,
  lockedMessage,
  pulseAriaLabel,
  isRtl,
  onQuickAction,
}: {
  hint: GrowthPathStepHint;
  locked: boolean;
  lockedMessage: string;
  pulseAriaLabel: string;
  isRtl: boolean;
  onQuickAction: () => void;
}) {
  const tooltipBody = locked ? lockedMessage : hint.whyThisMatters;
  const actionLabel = hint.quickAction;

  return (
    <div
      className={cn(
        "group/pulse absolute top-0 z-20",
        isRtl ? "-left-0.5" : "-right-0.5",
      )}
    >
      <button
        type="button"
        aria-label={pulseAriaLabel}
        className={cn(
          "relative flex size-6 items-center justify-center rounded-full border border-emerald-500/30 bg-zinc-950/90 text-emerald-300 shadow-sm transition",
          "hover:border-emerald-400/50 hover:bg-emerald-500/10 hover:text-emerald-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45",
        )}
      >
        <GrowthPathPulseSvg />
      </button>

      <div
        role="tooltip"
        className={cn(
          "pointer-events-none absolute top-full z-30 mt-2 w-[min(14rem,calc(100vw-2rem))] rounded-xl border border-zinc-700/80 bg-zinc-950/95 p-3 opacity-0 shadow-xl backdrop-blur-sm transition-opacity duration-150",
          "group-hover/pulse:pointer-events-auto group-focus-within/pulse:pointer-events-auto group-hover/pulse:opacity-100 group-focus-within/pulse:opacity-100",
          isRtl ? "right-0 text-right" : "left-1/2 -translate-x-1/2 text-left",
        )}
      >
        <p className="text-xs leading-relaxed text-white/80">{tooltipBody}</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuickAction();
          }}
          className={cn(
            "mt-2.5 w-full rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25",
            isRtl && "text-right",
          )}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

function GrowthPathPulseSvg() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="growth-path-pulse-icon"
    >
      <circle cx="7" cy="7" r="2" fill="currentColor" className="opacity-90" />
      <circle
        cx="7"
        cy="7"
        r="5"
        stroke="currentColor"
        strokeWidth="1"
        className="growth-path-pulse-ring opacity-50"
      />
    </svg>
  );
}

function GrowthPathConnector({ done, isRtl }: { done: boolean; isRtl: boolean }) {
  return (
    <div
      className={cn(
        "mt-5 hidden h-0.5 min-w-[0.5rem] flex-1 self-start sm:block",
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
