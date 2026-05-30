"use client";

import Image from "next/image";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TopChartApp } from "@/lib/play-store/fetch-top-charts";

type Props = {
  app: TopChartApp;
  rank: number;
  /** Highlight this row if it matches the user's own app */
  isOwnApp?: boolean;
};

function RankBadge({ rank }: { rank: number }) {
  const isTop3 = rank <= 3;
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
        rank === 1 && "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/30",
        rank === 2 && "bg-zinc-400/15 text-zinc-300 ring-1 ring-zinc-400/25",
        rank === 3 && "bg-orange-600/20 text-orange-300 ring-1 ring-orange-500/25",
        !isTop3 && "bg-white/[0.05] text-zinc-500",
      )}
    >
      {rank}
    </span>
  );
}

export function TopChartRow({ app, rank, isOwnApp = false }: Props) {
  const scoreDisplay =
    app.score != null ? app.score.toFixed(1) : null;
  const ratingsDisplay =
    app.ratings != null
      ? app.ratings >= 1_000_000
        ? `${(app.ratings / 1_000_000).toFixed(1)}M`
        : app.ratings >= 1_000
          ? `${(app.ratings / 1_000).toFixed(0)}K`
          : String(app.ratings)
      : null;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150",
        isOwnApp
          ? "border border-emerald-500/25 bg-emerald-500/[0.06] ring-1 ring-emerald-500/15"
          : "hover:bg-white/[0.04]",
      )}
    >
      {/* Rank */}
      <RankBadge rank={rank} />

      {/* Icon */}
      <div className="relative size-10 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
        {app.icon ? (
          <Image
            src={app.icon}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="h-full w-full bg-zinc-700" />
        )}
        {isOwnApp && (
          <div className="absolute inset-0 rounded-xl ring-2 ring-emerald-400/60" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn(
            "truncate text-sm font-medium leading-tight",
            isOwnApp ? "text-emerald-100" : "text-white/90",
          )}>
            {app.title}
          </p>
          {isOwnApp && (
            <span className="shrink-0 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
              Your app
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-zinc-500">{app.developer}</p>
      </div>

      {/* Stats */}
      <div className="hidden shrink-0 items-center gap-3 sm:flex">
        {scoreDisplay && (
          <div className="flex items-center gap-1">
            <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
            <span className="text-xs tabular-nums text-zinc-400">{scoreDisplay}</span>
            {ratingsDisplay && (
              <span className="text-[10px] text-zinc-600">({ratingsDisplay})</span>
            )}
          </div>
        )}
        {app.installs && (
          <span className="text-[11px] tabular-nums text-zinc-500">{app.installs}</span>
        )}
      </div>
    </div>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

export function TopChartRowSkeleton({ rank }: { rank: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-xs font-bold text-zinc-600">
        {rank}
      </span>
      <div className="size-10 shrink-0 animate-pulse rounded-xl bg-white/[0.06]" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-3 w-3/5 animate-pulse rounded-full bg-white/[0.07]" />
        <div className="h-2.5 w-2/5 animate-pulse rounded-full bg-white/[0.04]" />
      </div>
      <div className="hidden h-3 w-16 animate-pulse rounded-full bg-white/[0.04] sm:block" />
    </div>
  );
}
