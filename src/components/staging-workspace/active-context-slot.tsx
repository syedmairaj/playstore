"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const SLOT_BODY_MIN_H = "min-h-[60px]";

export type ActiveContextSlotProps = {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Shown in header — use number for signal count, or "—" when empty. */
  count?: number;
  isRtl?: boolean;
  headerBorderClass?: string;
  iconClassName?: string;
  bodyClassName?: string;
  /** Subtle amber warning in the header (e.g. expired sync). */
  headerStatusWarning?: string;
  children: React.ReactNode;
};

/**
 * Persistent Active Context module slot — header and container always stay mounted.
 */
export function ActiveContextSlot({
  id,
  icon: Icon,
  title,
  description,
  count,
  isRtl = false,
  headerBorderClass = "border-white/10",
  iconClassName = "text-white/60",
  bodyClassName = "bg-white/[0.02]",
  headerStatusWarning,
  children,
}: ActiveContextSlotProps) {
  const countLabel =
    typeof count === "number" && count > 0 ? `(${count})` : "—";

  return (
    <section
      id={id}
      data-active-context-slot={id}
      className="space-y-2 scroll-mt-24"
      aria-labelledby={`${id}-heading`}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b pb-2",
          headerBorderClass,
          isRtl && "flex-row-reverse",
        )}
      >
        <Icon className={cn("size-4 shrink-0", iconClassName)} aria-hidden />
        <h3
          id={`${id}-heading`}
          className={cn(
            "flex-1 text-[11px] font-semibold text-white/90",
            isRtl ? "font-arabic" : "uppercase tracking-[0.12em]",
          )}
        >
          {title}
        </h3>
        {headerStatusWarning ? (
          <span
            className="shrink-0"
            title={headerStatusWarning}
            aria-label={headerStatusWarning}
          >
            <AlertTriangle className="size-3.5 text-amber-400/75" aria-hidden />
          </span>
        ) : null}
        <span className="text-[10px] font-medium text-white/50 tabular-nums">
          {countLabel}
        </span>
      </div>

      {description ? (
        <p
          className={cn(
            "px-1 text-[9px] italic text-white/30",
            isRtl ? "text-right font-arabic" : "text-left",
          )}
        >
          {description}
        </p>
      ) : null}

      <div
        className={cn(
          "flex flex-wrap gap-2 rounded-lg border border-white/5 p-3",
          SLOT_BODY_MIN_H,
          bodyClassName,
          isRtl && "font-arabic",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export type ActiveContextSlotEmptyProps = {
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
  ctaClassName?: string;
  isRtl?: boolean;
};

/** Unified empty list state — left-aligned, non-disruptive secondary CTA. */
export function ActiveContextSlotEmpty({
  message,
  ctaLabel,
  ctaHref,
  onCtaClick,
  ctaClassName,
  isRtl = false,
}: ActiveContextSlotEmptyProps) {
  const ctaClasses = cn(
    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition",
    "border-white/15 bg-white/[0.04] text-white/55 hover:border-white/25 hover:bg-white/[0.06] hover:text-white/75",
    isRtl && "flex-row-reverse font-arabic",
    ctaClassName,
  );

  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-2 text-[11px]",
        isRtl ? "items-end text-right" : "items-start text-left",
      )}
    >
      <p className="italic text-white/35">{message}</p>
      {ctaLabel && ctaHref ? (
        <Link href={ctaHref} className={ctaClasses}>
          {ctaLabel}
          <ArrowRight className={cn("size-3", isRtl && "rotate-180")} aria-hidden />
        </Link>
      ) : null}
      {ctaLabel && onCtaClick ? (
        <button type="button" onClick={onCtaClick} className={ctaClasses}>
          {ctaLabel}
          <ArrowRight className={cn("size-3", isRtl && "rotate-180")} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
