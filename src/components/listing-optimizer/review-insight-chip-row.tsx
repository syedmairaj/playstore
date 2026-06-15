"use client";

import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IssueSeverity } from "@/lib/gemini/generate-review-analysis";

export const REVIEW_CHIP_ROW_H = 40;

const ROW_HOVER = "rgba(255, 255, 255, 0.04)";

function severityBadge(severity: IssueSeverity) {
  switch (severity) {
    case "CRITICAL":
      return {
        color: "#fca5a5",
        bg: "rgba(244, 63, 94, 0.12)",
        border: "rgba(244, 63, 94, 0.28)",
      };
    case "LOW":
      return {
        color: "#a1a1aa",
        bg: "rgba(113, 113, 122, 0.12)",
        border: "rgba(113, 113, 122, 0.25)",
      };
    default:
      return {
        color: "#fcd34d",
        bg: "rgba(251, 191, 36, 0.12)",
        border: "rgba(251, 191, 36, 0.28)",
      };
  }
}

function MetadataPill({
  label,
  color,
  bg,
  border,
  isRtl,
}: {
  label: string;
  color: string;
  bg: string;
  border: string;
  isRtl?: boolean;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-px text-[8px] font-semibold",
        isRtl ? "font-arabic" : "uppercase tracking-wide",
      )}
      style={{ color, backgroundColor: bg, borderColor: border }}
    >
      {label}
    </span>
  );
}

export type ReviewInsightChipRowProps = {
  text: string;
  categoryLabel: string;
  severityLabel: string;
  severity: IssueSeverity;
  isRtl?: boolean;
  adopted?: boolean;
  busy?: boolean;
  adoptEnabled?: boolean;
  onAdopt?: () => void;
  onDismiss?: () => void;
  dismissLabel: string;
  adoptLabel: string;
};

export function ReviewInsightChipRow({
  text,
  categoryLabel,
  severityLabel,
  severity,
  isRtl = false,
  adopted = false,
  busy = false,
  adoptEnabled = false,
  onAdopt,
  onDismiss,
  dismissLabel,
  adoptLabel,
}: ReviewInsightChipRowProps) {
  const badge = severityBadge(severity);

  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-1 py-0.5 transition-colors duration-150",
        isRtl && "flex-row-reverse",
        busy && "pointer-events-none opacity-50",
      )}
      style={{ minHeight: REVIEW_CHIP_ROW_H }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = ROW_HOVER;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <span
        className="line-clamp-2 min-w-0 flex-1 text-start text-[12px] font-medium leading-snug text-white/90"
        dir="auto"
        title={text}
      >
        {text}
      </span>

      <MetadataPill
        label={categoryLabel}
        color="rgba(196, 181, 253, 0.9)"
        bg="rgba(129, 140, 248, 0.12)"
        border="rgba(129, 140, 248, 0.22)"
        isRtl={isRtl}
      />

      <MetadataPill
        label={severityLabel}
        color={badge.color}
        bg={badge.bg}
        border={badge.border}
        isRtl={isRtl}
      />

      {adopted ? (
        <span
          className="shrink-0 text-emerald-400/70"
          title={adoptLabel}
          aria-label={adoptLabel}
        >
          <Check className="size-3.5" aria-hidden />
        </span>
      ) : (
        <>
          {onAdopt ? (
            <button
              type="button"
              disabled={!adoptEnabled || busy}
              onClick={(e) => {
                e.stopPropagation();
                if (!adoptEnabled) return;
                onAdopt();
              }}
              className={cn(
                "shrink-0 rounded p-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:opacity-30",
              )}
              style={{ color: "rgba(52, 211, 153, 0.75)" }}
              aria-label={adoptLabel}
              title={adoptLabel}
            >
              {busy ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : (
                <Check className="size-3" aria-hidden />
              )}
            </button>
          ) : null}

          {onDismiss ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              disabled={busy}
              className="shrink-0 rounded p-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
              style={{ color: "rgba(148, 163, 184, 0.4)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#f87171";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(148, 163, 184, 0.4)";
              }}
              aria-label={dismissLabel}
              title={dismissLabel}
            >
              <X className="size-3" aria-hidden />
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
