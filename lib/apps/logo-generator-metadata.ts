/**
 * Listing Optimizer logo generator — stored under `apps.metadata.logoGenerator` (JSONB).
 * Keeps last four HTTPS variant URLs from AI generation plus optional user selection
 * (may differ from `apps.icon_url` until the user taps “Use this”).
 */
export const APP_METADATA_LOGO_GENERATOR_KEY = "logoGenerator" as const;

export type AppLogoGeneratorMetadata = {
  generatedUrls: string[];
  selectedUrl: string | null;
  updatedAt: string;
};

export function parseLogoGeneratorMetadata(
  metadata: Record<string, unknown> | null | undefined,
): AppLogoGeneratorMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>)[APP_METADATA_LOGO_GENERATOR_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const urlsRaw = o.generatedUrls;
  const selectedRaw = o.selectedUrl;
  const updatedAt = typeof o.updatedAt === "string" ? o.updatedAt : "";
  if (!Array.isArray(urlsRaw) || urlsRaw.length === 0 || !updatedAt) return null;
  const generatedUrls = urlsRaw
    .filter((u): u is string => typeof u === "string" && /^https:\/\//i.test(u.trim()))
    .map((u) => u.trim())
    .slice(0, 4);
  if (generatedUrls.length === 0) return null;
  let selectedUrl: string | null = null;
  if (typeof selectedRaw === "string" && /^https:\/\//i.test(selectedRaw.trim())) {
    const s = selectedRaw.trim();
    if (generatedUrls.includes(s)) selectedUrl = s;
  }
  return { generatedUrls, selectedUrl, updatedAt };
}

/**
 * Icon for live phone: saved Play icon (`apps.icon_url`) wins; otherwise generator
 * selection / variants in `metadata.logoGenerator`, then legacy `metadata.icon_url`.
 */
export function resolveListingPreviewIconUrl(params: {
  iconUrlColumn?: string | null;
  metadata?: Record<string, unknown> | null;
}): string {
  const col = typeof params.iconUrlColumn === "string" ? params.iconUrlColumn.trim() : "";
  if (/^https:\/\//i.test(col)) return col;
  const lg = parseLogoGeneratorMetadata(params.metadata ?? null);
  if (lg?.selectedUrl && /^https:\/\//i.test(lg.selectedUrl)) return lg.selectedUrl;
  const first = lg?.generatedUrls?.[0];
  if (first && /^https:\/\//i.test(first)) return first;
  const metaIcon =
    params.metadata &&
    typeof params.metadata === "object" &&
    typeof (params.metadata as { icon_url?: unknown }).icon_url === "string"
      ? String((params.metadata as { icon_url: string }).icon_url).trim()
      : "";
  if (/^https:\/\//i.test(metaIcon)) return metaIcon;
  return "";
}
