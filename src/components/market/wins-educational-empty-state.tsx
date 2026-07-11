"use client";

import { Info, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";

type Props = {
  title: string;
  body: React.ReactNode;
  steps?: string[];
  isRtl?: boolean;
};

export function EducationalEmptyState({
  title,
  body,
  steps = [],
  isRtl = false,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 py-6",
        isRtl && "text-end",
      )}
    >
      <div
        className={cn(
          "mb-3 flex items-start gap-2.5",
          isRtl && "flex-row-reverse",
        )}
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-sky-500/25 bg-sky-500/10">
          <Lightbulb className="size-4 text-sky-300" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-200">{title}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{body}</p>
        </div>
      </div>
      {steps.length > 0 ? (
        <ol
          className={cn(
            "space-y-2 border-t border-white/6 pt-3",
            isRtl && "text-end",
          )}
        >
          {steps.map((step, i) => (
            <li
              key={step.slice(0, 32)}
              className={cn(
                "flex gap-2 text-[11px] leading-relaxed text-zinc-400",
                isRtl && "flex-row-reverse",
              )}
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-300">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function StepsTooltipPanel({
  intro,
  steps,
  isRtl = false,
}: {
  intro?: string;
  steps: string[];
  isRtl?: boolean;
}) {
  return (
    <div className={cn("space-y-2.5", isRtl && "text-end")}>
      {intro ? (
        <p className="text-[11px] font-medium text-zinc-200">{intro}</p>
      ) : null}
      <ol className={cn("space-y-2", isRtl && "text-end")}>
        {steps.map((step, i) => (
          <li
            key={step.slice(0, 40)}
            className={cn(
              "flex gap-2 text-[11px] leading-relaxed text-zinc-400",
              isRtl && "flex-row-reverse",
            )}
          >
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-300">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function MetricTitleWithStepsInfo({
  title,
  subtitle,
  intro,
  steps,
  isRtl = false,
}: {
  title: string;
  subtitle?: string;
  intro: string;
  steps: string[];
  isRtl?: boolean;
}) {
  const tooltipLabel = [intro, ...steps.map((s, i) => `${i + 1}. ${s}`)].join(" ");

  return (
    <div className={cn("min-w-0 flex-1", isRtl && "text-end")}>
      <div
        className={cn(
          "flex items-center gap-1.5",
          isRtl && "flex-row-reverse justify-end",
        )}
      >
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <TooltipProvider>
          <Tooltip
            content={
              <StepsTooltipPanel intro={intro} steps={steps} isRtl={isRtl} />
            }
            side={isRtl ? "left" : "top"}
            className="max-w-[300px] p-3"
            asChild
          >
            <button
              type="button"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/6 hover:text-zinc-300"
              aria-label={tooltipLabel}
            >
              <Info className="size-3.5" aria-hidden />
            </button>
          </Tooltip>
        </TooltipProvider>
      </div>
      {subtitle ? (
        <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function MetricTitleWithInfo({
  title,
  subtitle,
  tooltip,
  isRtl = false,
}: {
  title: string;
  subtitle?: string;
  tooltip: string;
  isRtl?: boolean;
}) {
  return (
    <div className={cn("min-w-0 flex-1", isRtl && "text-end")}>
      <div
        className={cn(
          "flex items-center gap-1.5",
          isRtl && "flex-row-reverse justify-end",
        )}
      >
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <TooltipProvider>
          <Tooltip
            content={tooltip}
            side={isRtl ? "left" : "top"}
            asChild
          >
            <button
              type="button"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/6 hover:text-zinc-300"
              aria-label={tooltip}
            >
              <Info className="size-3.5" aria-hidden />
            </button>
          </Tooltip>
        </TooltipProvider>
      </div>
      {subtitle ? (
        <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
