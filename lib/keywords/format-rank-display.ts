import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";

export function formatRankForDisplay(
  rank: number | null | undefined,
  labels: { notInTop: string },
): string {
  if (rank == null) return "—";
  if (rank >= SERPER_RANK_NOT_IN_FIRST_PAGE) return labels.notInTop;
  return `#${rank}`;
}
