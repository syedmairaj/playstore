"use client";

/**
 * PipelineProgressShell
 *
 * Shown while a modular pipeline job is in-flight (status: queued | processing).
 * It renders immediately on "Build" click — before the first poll — giving the
 * user instant visual feedback while the 40-90 second generation runs.
 *
 * As polling returns partial content (title → short → long), each card
 * transitions from a skeleton shimmer to real text.
 *
 * ┌──────────────────────────────────────────────────────┐
 * │  ● Title  ──  ● Short  ──  ● Long  ──  ○ Done        │  step indicator
 * │  ████████████████████████░░░░░░░░░░░░░░░░░░░░░░       │  progress bar
 * ├──────────────────────────────────────────────────────┤
 * │  Title              │  Short Description              │  content cards
 * │  [generated text]   │  [skeleton or text]             │
 * ├──────────────────────────────────────────────────────┤
 * │  Long Description                                     │
 * │  [skeleton or text]                                   │
 * └──────────────────────────────────────────────────────┘
 */

import { cn } from "@/lib/utils";
import { buildPipelineSteps } from "@/lib/listing/pipeline-progress.types";
import type {
  BuildMode,
  PipelinePhaseStep,
} from "@/lib/listing/pipeline-progress.types";
import type { PipelinePhaseProgress } from "@/hooks/useListingPipeline";

type PipelineProgressShellProps = {
  /** Build mode data (progress, partialContent, etc.) */
  buildMode: BuildMode;
  /** Phase completion booleans from the polling hook. */
  phases: PipelinePhaseProgress;
  /** Whether the UI is right-to-left (Arabic). */
  isRtl?: boolean;
  /** Optional version number label for the header. */
  versionLabel?: string;
};

// ── Skeleton shimmer ─────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-zinc-700/60",
        className,
      )}
      aria-hidden="true"
    />
  );
}

// ── Step dot ─────────────────────────────────────────────────────────────────
function StepDot({ step, isRtl }: { step: PipelinePhaseStep; isRtl?: boolean }) {
  const label = isRtl ? step.labelAr : step.label;

  const dotClass = cn(
    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500",
    step.status === "done" && "border-emerald-500 bg-emerald-500",
    step.status === "active" &&
      "border-emerald-400 bg-emerald-400/20 ring-2 ring-emerald-400/30",
    step.status === "pending" && "border-zinc-600 bg-zinc-800",
  );

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={dotClass}>
        {step.status === "done" && (
          <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
            <path d="M10 3L5 8.5 2 5.5l-1 1 4 4 6-7z" />
          </svg>
        )}
        {step.status === "active" && (
          <span className="block h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
        )}
      </div>
      <span
        className={cn(
          "text-[10px] font-medium transition-colors duration-300",
          step.status === "done" && "text-emerald-400",
          step.status === "active" && "text-emerald-300",
          step.status === "pending" && "text-zinc-500",
        )}
      >
        {label}
      </span>
    </div>
  );
}

// ── Content card ─────────────────────────────────────────────────────────────
function ContentCard({
  label,
  value,
  isLoading,
  skeletonLines = 2,
  className,
}: {
  label: string;
  value: string | null;
  isLoading: boolean;
  skeletonLines?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-700/60 bg-zinc-800/50 p-4 transition-all duration-500",
        isLoading && !value && "border-zinc-700/40 bg-zinc-800/30",
        className,
      )}
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      {value ? (
        <p className="animate-fade-in text-sm leading-relaxed text-white/90">
          {value}
        </p>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: skeletonLines }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn(
                "h-3.5",
                i === skeletonLines - 1 ? "w-2/3" : "w-full",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function PipelineProgressShell({
  buildMode,
  phases,
  isRtl = false,
  versionLabel,
}: PipelineProgressShellProps) {
  const { progressPercent, currentPhase, partialContent } = buildMode;
  const steps = buildPipelineSteps(phases, currentPhase);

  const activeStepLabel = (() => {
    if (currentPhase === "title") return isRtl ? "يولّد العنوان…" : "Writing title…";
    if (currentPhase === "short")
      return isRtl ? "يولّد الوصف القصير…" : "Writing short description…";
    if (currentPhase === "long")
      return isRtl ? "يولّد الوصف الطويل…" : "Writing long description…";
    if (!currentPhase && progressPercent < 10)
      return isRtl ? "جارٍ الإرسال إلى قائمة الانتظار…" : "Queuing job…";
    return isRtl ? "يُكمل التوليد…" : "Finalising…";
  })();

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="space-y-4 rounded-2xl border border-zinc-700/60 bg-zinc-900/80 p-5"
      role="status"
      aria-label={isRtl ? "توليد القائمة جارٍ…" : "Listing generation in progress…"}
      aria-live="polite"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-white/90">
            {versionLabel
              ? (isRtl ? `إصدار جديد — ${versionLabel}` : `New version — ${versionLabel}`)
              : (isRtl ? "إصدار جديد" : "New version")}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">{activeStepLabel}</p>
        </div>
        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-400 ring-1 ring-amber-500/20">
          {isRtl ? "يتم التوليد" : "Generating"}
        </span>
      </div>

      {/* ── Step indicators ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-1 rounded-lg bg-zinc-800/60 px-3 py-3">
        {steps.map((step, idx) => (
          <div key={step.phase} className="flex flex-1 items-center">
            <StepDot step={step} isRtl={isRtl} />
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "mx-1 h-px flex-1 transition-colors duration-500",
                  steps[idx + 1].status !== "pending" ||
                  step.status === "done"
                    ? "bg-emerald-500/40"
                    : "bg-zinc-700",
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Progress bar ────────────────────────────────────────────────── */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700/60">
        <div
          className="h-full rounded-full bg-emerald-400 transition-all duration-700 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* ── Content cards ───────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ContentCard
          label={isRtl ? "العنوان" : "Title"}
          value={partialContent.title}
          isLoading
          skeletonLines={2}
        />
        <ContentCard
          label={isRtl ? "الوصف القصير" : "Short Description"}
          value={partialContent.shortDescription}
          isLoading={!partialContent.shortDescription}
          skeletonLines={3}
        />
      </div>
      <ContentCard
        label={isRtl ? "الوصف الطويل" : "Long Description"}
        value={partialContent.longDescription}
        isLoading={!partialContent.longDescription}
        skeletonLines={6}
        className="min-h-[100px]"
      />

      {/* ── Footer hint ─────────────────────────────────────────────────── */}
      <p className={cn("text-[11px] text-zinc-500", isRtl && "text-right")}>
        {isRtl
          ? "ستظهر النتائج هنا فور اكتمال كل خطوة — لا داعي للانتظار"
          : "Results appear here as each step completes — no need to wait"}
      </p>
    </div>
  );
}
