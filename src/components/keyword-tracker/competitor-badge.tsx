"use client";

import { useState } from "react";
import { AppWindow } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";
import { resolveCompetitorInitials } from "@/lib/competitors/competitor-initials";

/** Compact rank line shown beneath the competitor avatar — never long copy in the cell. */
export type CompetitorBadgeRankState = "ranked" | "pending" | "not_ranked" | "empty";

export type CompetitorBadgeProps = {
  displayName: string;
  packageId: string;
  serpDisplayName?: string | null;
  iconUrl?: string | null;
  /** 1-indexed organic rank when `rankState` is `ranked`. */
  rank?: number | null;
  rankState: CompetitorBadgeRankState;
  tooltip: string;
  className?: string;
};

const BADGE_WIDTH = "w-11";
const AVATAR_SIZE_PX = 32;

function rankLineContent(rankState: CompetitorBadgeRankState, rank: number | null | undefined) {
  if (rankState === "ranked" && rank != null) {
    return `#${rank}`;
  }
  if (rankState === "pending") {
    return "…";
  }
  return "—";
}

/**
 * Fixed-width competitor chip for the Keyword Tracker watchlist.
 * Icon on top, monospaced rank glyph below — keeps row height and column rhythm stable.
 */
export function CompetitorBadge({
  displayName,
  packageId,
  serpDisplayName,
  iconUrl,
  rank,
  rankState,
  tooltip,
  className,
}: CompetitorBadgeProps) {
  const [storedIconFailed, setStoredIconFailed] = useState(false);
  const rankText = rankLineContent(rankState, rank);
  const isRanked = rankState === "ranked";
  const isPending = rankState === "pending";

  const initials = resolveCompetitorInitials(displayName, packageId, serpDisplayName);
  const storedIconUrl = iconUrl?.trim() || null;
  const showStoredIcon = Boolean(storedIconUrl) && !storedIconFailed;
  const showInitials = !showStoredIcon && Boolean(initials);
  const showPlaceholder = !showStoredIcon && !showInitials;

  return (
    <Tooltip
      content={
        <span className="block max-w-[260px] leading-snug text-zinc-200">{tooltip}</span>
      }
      side="top"
      className="max-w-[280px] border border-white/[0.12] bg-[#0a0d12] px-2.5 py-1.5 text-xs text-zinc-200 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.7)]"
      asChild
    >
      <div
        className={cn(
          BADGE_WIDTH,
          COMPETITOR_BADGE_STACK_HEIGHT,
          "flex shrink-0 cursor-default flex-col items-center justify-start gap-1",
          className,
        )}
        tabIndex={0}
        aria-label={`${displayName}: ${tooltip}`}
      >
        <div
          className={cn(
            "relative shrink-0 overflow-hidden rounded-full",
            "border border-zinc-700/80 bg-zinc-800/70 ring-1 ring-white/[0.05]",
            isRanked && "ring-amber-500/20",
          )}
          style={{ width: AVATAR_SIZE_PX, height: AVATAR_SIZE_PX }}
        >
          {showStoredIcon ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={storedIconUrl!}
              alt=""
              className="absolute inset-0 size-full object-cover"
              loading="lazy"
              onError={() => setStoredIconFailed(true)}
            />
          ) : null}

          {showInitials ? (
            <span
              className="absolute inset-0 flex items-center justify-center bg-zinc-800/95 text-xs font-bold uppercase tracking-tight text-zinc-200"
              aria-hidden
            >
              {initials}
            </span>
          ) : null}

          {showPlaceholder ? (
            <span
              className="absolute inset-0 flex items-center justify-center bg-zinc-800/95 text-zinc-500"
              aria-hidden
              title="Unknown competitor"
            >
              <AppWindow className="size-4" strokeWidth={2} />
            </span>
          ) : null}
        </div>

        <span
          className={cn(
            "flex h-3.5 w-full items-center justify-center font-mono text-[10px] leading-none tabular-nums",
            isRanked && "font-medium text-amber-300/95",
            isPending && "font-medium text-amber-200/75",
            !isRanked && !isPending && "text-zinc-500",
          )}
          aria-hidden
        >
          {rankText}
        </span>
      </div>
    </Tooltip>
  );
}

/** Icon + rank line — keeps every watchlist row the same height in the competitors column. */
export const COMPETITOR_BADGE_STACK_HEIGHT = "h-[3rem]";

/** Invisible spacer matching {@link CompetitorBadge} footprint — preserves two-column rhythm. */
export function CompetitorBadgeSpacer({ className }: { className?: string }) {
  return (
    <div
      className={cn(BADGE_WIDTH, COMPETITOR_BADGE_STACK_HEIGHT, "shrink-0", className)}
      aria-hidden
    />
  );
}
