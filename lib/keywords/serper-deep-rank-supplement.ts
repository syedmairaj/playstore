import { reindexSerpItemsByMergedOrder } from "@/lib/keywords/serper-snapshot-rank-resolve";
import type { SerperPreviewItem } from "@/lib/keywords/serper-preview-types";

function itemKey(item: SerperPreviewItem): string {
  return (item.packageId ?? item.link).trim().toLowerCase();
}

/**
 * Merges native Play Store search results over sparse Serper deep-rank items.
 * Play search order wins when the same package appears in both lists; Serper-only
 * extras are appended after the Play slice (web-index positions are not comparable).
 */
export function supplementDeepRankSerperWithPlaySearch(
  serperItems: readonly SerperPreviewItem[],
  playItems: readonly SerperPreviewItem[],
): SerperPreviewItem[] {
  if (playItems.length === 0) return [...serperItems];
  const playOrdered = [...playItems].sort((a, b) => a.position - b.position);
  const playKeys = new Set(playOrdered.map(itemKey).filter(Boolean));
  const serperOnly = serperItems.filter((item) => {
    const key = itemKey(item);
    return key && !playKeys.has(key);
  });
  const tailStart = playOrdered.length;
  const serperExtras = serperOnly.map((item, index) => ({
    ...item,
    position: tailStart + index + 1,
  }));
  return reindexSerpItemsByMergedOrder([...playOrdered, ...serperExtras]);
}
