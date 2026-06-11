import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import {
  LIVE_RANK_VISIBILITY_CEILING,
  type SerperRankMatchKind,
} from "@/lib/keywords/serper-snapshot-rank-resolve";

export type RankDisplayLabels = {
  notInTop: string;
  notPublished?: string;
  outsideTopTooltip?: string;
  /** Shown while a Serper / Play search refresh is in flight. */
  pending?: string;
  pendingTooltip?: string;
};

export type RankDisplayContext = {
  workspaceAppLive?: boolean;
  column?: "yours" | "theirs";
  /** From snapshot `rank_match_kind` — retained for callers; not used for Pending vs 50+. */
  matchKind?: SerperRankMatchKind | null;
  /** True while serper-refresh is running for this keyword row. */
  isSearchInProgress?: boolean;
  /** True when at least one rank snapshot exists for this keyword × market. */
  searchComplete?: boolean;
};

export type ResolvedRankDisplay = {
  text: string;
  tooltip?: string;
  variant: "empty" | "rank" | "outsideTop" | "notPublished" | "pending";
};

function isOutsideTopRank(rank: number): boolean {
  return rank > LIVE_RANK_VISIBILITY_CEILING || rank >= SERPER_RANK_NOT_IN_FIRST_PAGE;
}

export function resolveRankDisplay(
  rank: number | null | undefined,
  labels: RankDisplayLabels,
  ctx?: RankDisplayContext,
): ResolvedRankDisplay {
  const column = ctx?.column ?? "theirs";
  const live = ctx?.workspaceAppLive !== false;

  if (ctx?.isSearchInProgress) {
    return {
      text: labels.pending ?? "Pending",
      tooltip: labels.pendingTooltip,
      variant: "pending",
    };
  }

  if (column === "yours" && !live) {
    return {
      text: labels.notPublished ?? "N/A",
      variant: "notPublished",
    };
  }

  if (rank == null) {
    if (column === "yours" && live && ctx?.searchComplete) {
      return {
        text: labels.notInTop,
        tooltip: labels.outsideTopTooltip,
        variant: "outsideTop",
      };
    }
    return { text: "—", variant: "empty" };
  }

  if (isOutsideTopRank(rank)) {
    return {
      text: labels.notInTop,
      tooltip: labels.outsideTopTooltip,
      variant: "outsideTop",
    };
  }

  return { text: `#${rank}`, variant: "rank" };
}

export function formatRankForDisplay(
  rank: number | null | undefined,
  labels: { notInTop: string },
  ctx?: RankDisplayContext,
): string {
  const extended: RankDisplayLabels = {
    notInTop: labels.notInTop,
    notPublished: "notPublished" in labels ? (labels as RankDisplayLabels).notPublished : undefined,
    outsideTopTooltip:
      "outsideTopTooltip" in labels ? (labels as RankDisplayLabels).outsideTopTooltip : undefined,
    pending: "pending" in labels ? (labels as RankDisplayLabels).pending : undefined,
    pendingTooltip:
      "pendingTooltip" in labels ? (labels as RankDisplayLabels).pendingTooltip : undefined,
  };
  return resolveRankDisplay(rank, extended, ctx).text;
}
