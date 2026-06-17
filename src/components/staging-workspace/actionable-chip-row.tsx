"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ACTIVE_CONTEXT_ROW_HOVER,
  ACTIVE_CONTEXT_ROW_MIN_HEIGHT,
} from "@/components/staging-workspace/active-context-tokens";
import {
  ACTIVE_CONTEXT_JUST_STAGED_ROW_CLASS,
  ACTIVE_CONTEXT_STAGED_ROW_CLASS,
  StagedSignalBadge,
} from "@/components/staging-workspace/staged-signal-badge";

export type ChipMetadataTone =
  | "neutral"
  | "rose"
  | "amber"
  | "indigo"
  | "emerald"
  | "sky"
  | "violet"
  | "orange";

export type ChipMetadataTag = {
  label: string;
  tone?: ChipMetadataTone;
};

/** Ultra-soft metadata pills — low opacity tints, no borders. */
const TONE_CLASSES: Record<ChipMetadataTone, string> = {
  neutral: "bg-white/[0.04] text-white/35",
  rose: "bg-rose-500/[0.07] text-rose-300/45",
  amber: "bg-amber-500/[0.07] text-amber-300/45",
  indigo: "bg-blue-500/[0.07] text-blue-300/45",
  emerald: "bg-emerald-500/[0.07] text-emerald-300/45",
  sky: "bg-sky-500/[0.07] text-sky-300/45",
  violet: "bg-blue-500/[0.07] text-blue-300/45",
  orange: "bg-orange-500/[0.07] text-orange-300/45",
};

export type ActionableChipRowProps = {
  summary: string;
  tags?: ChipMetadataTag[];
  sourceTooltip: string;
  isRtl?: boolean;
  lineClamp?: 1 | 2;
  minHeight?: number;
  onRowClick?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  isRemoving?: boolean;
  showRemove?: boolean;
  /** Row is committed to Active Context — unified staged chrome. */
  isStaged?: boolean;
  /** Brief highlight after staging via + toggle. */
  justStaged?: boolean;
  /** Show + control to stage/adopt (Conversion Uplift pending insights). */
  showStageButton?: boolean;
  onStageClick?: () => void;
  stageLabel?: string;
  isStaging?: boolean;
};

function MetadataPill({
  tag,
  isRtl,
}: {
  tag: ChipMetadataTag;
  isRtl?: boolean;
}) {
  const tone = tag.tone ?? "neutral";
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[8px] font-medium",
        TONE_CLASSES[tone],
        isRtl ? "font-arabic" : "uppercase tracking-[0.08em]",
      )}
    >
      {tag.label}
    </span>
  );
}

export function ActionableChipRow({
  summary,
  tags = [],
  sourceTooltip,
  isRtl = false,
  lineClamp = 1,
  minHeight = ACTIVE_CONTEXT_ROW_MIN_HEIGHT,
  onRowClick,
  onRemove,
  removeLabel = "Remove",
  isRemoving = false,
  showRemove = true,
  isStaged = false,
  justStaged = false,
  showStageButton = false,
  onStageClick,
  stageLabel = "Stage signal",
  isStaging = false,
}: ActionableChipRowProps) {
  const [flashStage, setFlashStage] = useState(false);
  const interactive = Boolean(onRowClick) && !showStageButton;

  useEffect(() => {
    if (!justStaged) return;
    setFlashStage(true);
    const timer = window.setTimeout(() => setFlashStage(false), 700);
    return () => window.clearTimeout(timer);
  }, [justStaged]);

  const handleStageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStaging) return;
    setFlashStage(true);
    onStageClick?.();
    window.setTimeout(() => setFlashStage(false), 700);
  };

  const row = (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onRowClick : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "group flex w-full items-center gap-3 px-3 py-2.5",
        ACTIVE_CONTEXT_ROW_HOVER,
        isStaged && ACTIVE_CONTEXT_STAGED_ROW_CLASS,
        (justStaged || flashStage) && ACTIVE_CONTEXT_JUST_STAGED_ROW_CLASS,
        interactive && "cursor-pointer",
      )}
      style={{ minHeight }}
    >
      <span
        className={cn(
          "min-w-0 flex-1 text-start text-[13px] font-semibold leading-snug text-white/90",
          lineClamp === 2 ? "line-clamp-2" : "truncate",
        )}
        dir="auto"
      >
        {summary}
      </span>

      {tags.map((tag) => (
        <MetadataPill key={`${tag.label}-${tag.tone ?? "neutral"}`} tag={tag} isRtl={isRtl} />
      ))}

      {isStaged ? <StagedSignalBadge isRtl={isRtl} /> : null}

      {showStageButton && onStageClick ? (
        <button
          type="button"
          onClick={handleStageClick}
          disabled={isStaging}
          className={cn(
            "shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-1",
            "text-emerald-300/80 transition-all duration-300 ease-out",
            "hover:border-emerald-400/50 hover:bg-emerald-500/20 hover:text-emerald-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40",
            "disabled:opacity-40",
            (justStaged || flashStage) &&
              "border-emerald-400/60 bg-emerald-500/25 text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.25)]",
          )}
          aria-label={stageLabel}
        >
          {isStaging ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-3.5" aria-hidden />
          )}
        </button>
      ) : null}

      {showRemove && onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={isRemoving}
          className={cn(
            "ms-0.5 shrink-0 rounded p-0.5 text-white/25",
            "transition-all duration-200 ease-out",
            isStaged
              ? "opacity-55 group-hover:opacity-100 focus-visible:opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            "hover:text-white/55 disabled:opacity-30",
          )}
          aria-label={removeLabel}
        >
          {isRemoving ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <X className="size-3.5" aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  );

  return (
    <Tooltip content={sourceTooltip} delayDuration={300} asChild>
      <div className="w-full py-0.5">{row}</div>
    </Tooltip>
  );
}

export function difficultyToTone(difficulty: number): ChipMetadataTone {
  if (difficulty >= 7) return "rose";
  if (difficulty >= 4) return "amber";
  return "emerald";
}

export function severityToTone(
  severity: "CRITICAL" | "MEDIUM" | "LOW",
): ChipMetadataTone {
  if (severity === "CRITICAL") return "rose";
  if (severity === "LOW") return "neutral";
  return "amber";
}

export function reviewCategoryToTone(category: string): ChipMetadataTone {
  const map: Record<string, ChipMetadataTone> = {
    UX: "indigo",
    CRASHES: "rose",
    ACCURACY: "sky",
    PERFORMANCE: "amber",
    PRICING: "indigo",
    FEATURES: "emerald",
  };
  return map[category] ?? "indigo";
}
