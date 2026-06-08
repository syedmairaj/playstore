"use client";

import { Info } from "lucide-react";
import {
  resolveRankDisplay,
  type RankDisplayContext,
  type RankDisplayLabels,
} from "@/lib/keywords/format-rank-display";
import { cn } from "@/lib/utils";

type Props = {
  rank: number | null | undefined;
  labels: RankDisplayLabels;
  context?: RankDisplayContext;
  className?: string;
  emphasize?: boolean;
  emptyFallback?: string;
};

export function RankDisplay({
  rank,
  labels,
  context,
  className,
  emphasize,
  emptyFallback = "—",
}: Props) {
  const resolved = resolveRankDisplay(rank, labels, context);

  if (resolved.variant === "empty") {
    return <span className={cn("text-zinc-500", className)}>{emptyFallback}</span>;
  }

  const content = (
    <span
      className={cn(
        "tabular-nums",
        resolved.variant === "notPublished" && "text-zinc-500",
        resolved.variant === "outsideTop" && (emphasize ? "font-medium text-emerald-300/90" : "text-zinc-200"),
        resolved.variant === "rank" && (emphasize ? "font-medium text-emerald-300/90" : "text-zinc-200"),
        className,
      )}
    >
      {resolved.text}
    </span>
  );

  if (!resolved.tooltip) return content;

  return (
    <span className={cn("inline-flex items-center gap-1", className)} title={resolved.tooltip}>
      {content}
      <Info className="size-3.5 shrink-0 text-zinc-500" aria-hidden />
      <span className="sr-only">{resolved.tooltip}</span>
    </span>
  );
}
