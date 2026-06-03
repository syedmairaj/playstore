/**
 * Safe ASCII download filenames for generated logos (Play / CDN URLs may be long or non-Latin).
 */

function slugifyLatinSegment(raw: string, maxLen: number): string {
  const s = raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, maxLen);
  return s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

export function shortUrlHash(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (Math.imul(31, h) + url.charCodeAt(i)) >>> 0;
  }
  return h.toString(36).padStart(6, "0").slice(0, 8);
}

function appNameHasLatinOrDigit(appName: string): boolean {
  return /[a-zA-Z0-9]/.test(
    appName.normalize("NFKD").replace(/\p{M}/gu, ""),
  );
}

function appNameHasArabicScript(appName: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
    appName,
  );
}

/**
 * `{base}-logo-{1-based index}.png` (or `{base}-logo-{idx}-{exportTag}.png`) with a filesystem-safe ASCII `base`.
 * Latin slug from `appName`, else `app-icon`. If the app name is Arabic-only (no Latin digits/letters),
 * use `category` slug + short URL hash instead of `app-icon`. Final fallback: `logo-{hash}-{n}.png`.
 */
export function buildLogoDownloadFilename(input: {
  appName: string;
  category: string;
  imageUrl: string;
  /** 0-based index of the variant in the batch */
  index: number;
  /** e.g. `512`, `1024` → `slug-logo-1-512.png` (Play export naming). */
  exportTag?: string;
}): string {
  const idx = input.index + 1;
  const tag =
    typeof input.exportTag === "string" &&
    /^[a-zA-Z0-9]+$/.test(input.exportTag)
      ? input.exportTag
      : "";
  const suffix = tag ? `-${tag}` : "";
  const hash = shortUrlHash(input.imageUrl);
  const appSlug = slugifyLatinSegment(input.appName.trim(), 48);
  if (appSlug) {
    const stem = `${appSlug}-logo-${idx}${suffix}`.replace(/-+/g, "-");
    return `${stem.slice(0, 120)}.png`;
  }

  const arabicOnly =
    !appNameHasLatinOrDigit(input.appName) &&
    appNameHasArabicScript(input.appName);
  const catSlug = slugifyLatinSegment(input.category.trim(), 40);
  if (arabicOnly && catSlug) {
    const stem = `${catSlug}-logo-${hash}-${idx}${suffix}`.replace(/-+/g, "-");
    return `${stem.slice(0, 120)}.png`;
  }

  if (arabicOnly) {
    return `logo-${hash}-${idx}${suffix}.png`.slice(0, 120);
  }

  const stem = `app-icon-logo-${idx}${suffix}`.replace(/-+/g, "-");
  return `${stem.slice(0, 120)}.png`;
}
