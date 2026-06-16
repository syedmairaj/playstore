"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Info } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ACTIVE_CONTEXT_DESCRIPTION_CLASS,
  ACTIVE_CONTEXT_HEADER_CLASS,
  ACTIVE_CONTEXT_HEADER_CLASS_AR,
  ACTIVE_CONTEXT_HEADER_ICON_GAP,
  ACTIVE_CONTEXT_HEADER_ICON_SIZE_PX,
  ACTIVE_CONTEXT_HEADER_ICON_STROKE,
  ACTIVE_CONTEXT_HEADER_UNIT_BOTTOM,
  ACTIVE_CONTEXT_TITLE_UNIT_GAP,
} from "@/components/staging-workspace/active-context-tokens";

export type ActiveContextSlotProps = {
  id: string;
  icon: LucideIcon;
  /** Hex color for the section icon (see ACTIVE_CONTEXT_MODULE_ICON_COLOR). */
  iconColor: string;
  title: string;
  description?: string;
  moduleTip?: string;
  count?: number;
  isRtl?: boolean;
  headerStatusWarning?: string;
  children: React.ReactNode;
};

export function ActiveContextSlot({
  id,
  icon: Icon,
  iconColor,
  title,
  description,
  moduleTip,
  count,
  isRtl = false,
  headerStatusWarning,
  children,
}: ActiveContextSlotProps) {
  const countLabel =
    typeof count === "number" && count > 0 ? `(${count})` : "—";

  return (
    <section
      id={id}
      data-active-context-slot={id}
      className="scroll-mt-24"
      aria-labelledby={`${id}-heading`}
    >
      <header className={ACTIVE_CONTEXT_HEADER_UNIT_BOTTOM}>
        <div
          className={cn(
            "mt-0.5 flex items-center",
            ACTIVE_CONTEXT_HEADER_ICON_GAP,
            isRtl && "flex-row-reverse",
          )}
        >
          <Icon
            className="shrink-0"
            width={ACTIVE_CONTEXT_HEADER_ICON_SIZE_PX}
            height={ACTIVE_CONTEXT_HEADER_ICON_SIZE_PX}
            strokeWidth={ACTIVE_CONTEXT_HEADER_ICON_STROKE}
            style={{ color: iconColor }}
            aria-hidden
          />
          <h3
            id={`${id}-heading`}
            className={cn(
              "flex-1",
              isRtl
                ? ACTIVE_CONTEXT_HEADER_CLASS_AR
                : `${ACTIVE_CONTEXT_HEADER_CLASS} uppercase`,
            )}
          >
            {title}
          </h3>
          {moduleTip ? (
            <Tooltip content={moduleTip} delayDuration={300} asChild>
              <button
                type="button"
                className="shrink-0 rounded-full p-0.5 text-white/25 transition-colors duration-200 hover:text-white/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
                aria-label={moduleTip}
              >
                <Info className="size-3" aria-hidden />
              </button>
            </Tooltip>
          ) : null}
          {headerStatusWarning ? (
            <Tooltip content={headerStatusWarning} delayDuration={300} asChild>
              <button
                type="button"
                className="shrink-0 rounded-full p-0.5 text-amber-400/50 transition-colors duration-200 hover:text-amber-300/70"
                aria-label={headerStatusWarning}
              >
                <AlertTriangle className="size-3" aria-hidden />
              </button>
            </Tooltip>
          ) : null}
          <span className="shrink-0 text-[10px] font-medium tabular-nums text-white/28">
            {countLabel}
          </span>
        </div>

        {description ? (
          <p
            className={cn(
              ACTIVE_CONTEXT_DESCRIPTION_CLASS,
              ACTIVE_CONTEXT_TITLE_UNIT_GAP,
              "max-w-2xl",
              isRtl ? "text-right font-arabic" : "text-left",
            )}
          >
            {description}
          </p>
        ) : null}
      </header>

      <div className={cn("flex flex-col", isRtl && "font-arabic")}>
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
  isRtl?: boolean;
};

export function ActiveContextSlotEmpty({
  message,
  ctaLabel,
  ctaHref,
  onCtaClick,
  isRtl = false,
}: ActiveContextSlotEmptyProps) {
  return (
    <p
      className={cn(
        "py-1 text-[11px] leading-relaxed text-white/28",
        isRtl ? "text-right font-arabic" : "text-left",
      )}
    >
      {message}
      {ctaLabel && ctaHref ? (
        <>
          {" "}
          <Link
            href={ctaHref}
            className="text-white/40 underline-offset-2 transition-colors duration-200 hover:text-white/55 hover:underline"
          >
            {ctaLabel}
          </Link>
        </>
      ) : null}
      {ctaLabel && onCtaClick ? (
        <>
          {" "}
          <button
            type="button"
            onClick={onCtaClick}
            className="text-white/40 underline-offset-2 transition-colors duration-200 hover:text-white/55 hover:underline"
          >
            {ctaLabel}
          </button>
        </>
      ) : null}
    </p>
  );
}
