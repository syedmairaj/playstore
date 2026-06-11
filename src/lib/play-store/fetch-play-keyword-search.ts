import "server-only";

import gplay from "google-play-scraper";
import type { IAppItem } from "google-play-scraper";
import type { SerperPreviewItem } from "@/lib/keywords/serper-preview-types";

const DEFAULT_NUM = 50;

function mapAppItemToSerperItem(item: IAppItem, index: number): SerperPreviewItem | null {
  const appId = typeof item.appId === "string" ? item.appId.trim() : "";
  const url = typeof item.url === "string" ? item.url.trim() : "";
  if (!appId && !url) return null;
  const link =
    url ||
    `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}`;
  const title = typeof item.title === "string" && item.title.trim() ? item.title.trim() : appId;
  const summary =
    typeof item.summary === "string" && item.summary.trim() ? item.summary.trim() : null;
  return {
    title,
    link,
    packageId: appId || null,
    position: index + 1,
    snippet: summary,
  };
}

/**
 * Native Google Play Store keyword search via `google-play-scraper`.
 * Used to supplement sparse Serper web-index results during deep rank refresh.
 */
export async function fetchPlayKeywordSearch(
  keyword: string,
  country: string,
  hl: string,
  num: number = DEFAULT_NUM,
): Promise<SerperPreviewItem[]> {
  const term = String(keyword ?? "").trim();
  if (!term) return [];

  const gl = String(country ?? "us").trim().toLowerCase() || "us";
  const lang = String(hl ?? "en").trim().toLowerCase() || "en";
  const limit = Math.min(Math.max(Math.floor(num), 1), 250);

  try {
    const results = await gplay.search({ term, num: limit, lang, country: gl });
    const out: SerperPreviewItem[] = [];
    for (let i = 0; i < results.length; i++) {
      const mapped = mapAppItemToSerperItem(results[i]!, i);
      if (mapped) out.push(mapped);
    }
    return out;
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[fetchPlayKeywordSearch]", { term, country: gl, lang, message });
    }
    return [];
  }
}
