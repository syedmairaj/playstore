import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";

export type RankDisplayLabels = {
  notInTop: string;
  notPublished?: string;
  outsideTopTooltip?: string;
};

export type RankDisplayContext = {
  /** When false, missing / sentinel ranks for *your* app show notPublished (not "20+"). */
  workspaceAppLive?: boolean;
  /** `yours` applies unpublished handling; `theirs` uses standard rank rules. */
  column?: "yours" | "theirs";
};

export type ResolvedRankDisplay = {
  text: string;
  tooltip?: string;
  variant: "empty" | "rank" | "outsideTop" | "notPublished";
};

function isOutsideTopRank(rank: number): boolean {
  return rank > 20 || rank >= SERPER_RANK_NOT_IN_FIRST_PAGE;
}

export function resolveRankDisplay(
  rank: number | null | undefined,
  labels: RankDisplayLabels,
  ctx?: RankDisplayContext,
): ResolvedRankDisplay {
  const column = ctx?.column ?? "theirs";
  const live = ctx?.workspaceAppLive !== false;

  if (column === "yours" && !live) {
    return {
      text: labels.notPublished ?? "N/A",
      variant: "notPublished",
    };
  }

  if (rank == null) {
    if (column === "yours" && live) {
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
  };
  return resolveRankDisplay(rank, extended, ctx).text;
}
