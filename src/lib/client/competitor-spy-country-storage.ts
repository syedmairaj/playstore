import {
  isSupportedCountry,
  type SupportedCountryCode,
} from "@/lib/countries";

/** Persisted multi-market selection (unique ISO codes, lowercase). */
export const PLAYSTORE_SELECTED_COUNTRIES_STORAGE = "playstore_selected_countries";

/** Active country sub-tab within Competitor Spy. */
export const PLAYSTORE_ACTIVE_COUNTRY_STORAGE = "playstore_active_country";

function uniqueSupported(codes: string[]): SupportedCountryCode[] {
  const seen = new Set<SupportedCountryCode>();
  const out: SupportedCountryCode[] = [];
  for (const raw of codes) {
    const c = String(raw ?? "").trim().toLowerCase();
    if (!isSupportedCountry(c) || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

export function readPersistedSelectedCountries(
  fallback: SupportedCountryCode[],
): SupportedCountryCode[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PLAYSTORE_SELECTED_COUNTRIES_STORAGE);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const codes = uniqueSupported(parsed.map(String));
    return codes.length > 0 ? codes : fallback;
  } catch {
    return fallback;
  }
}

export function writePersistedSelectedCountries(codes: SupportedCountryCode[]): void {
  if (typeof window === "undefined") return;
  const unique = uniqueSupported(codes);
  if (unique.length === 0) return;
  try {
    localStorage.setItem(PLAYSTORE_SELECTED_COUNTRIES_STORAGE, JSON.stringify(unique));
  } catch {
    /* quota / private mode */
  }
}

export function readPersistedActiveCountry(
  fallback: SupportedCountryCode,
  selected: SupportedCountryCode[],
): SupportedCountryCode {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PLAYSTORE_ACTIVE_COUNTRY_STORAGE)?.trim().toLowerCase();
    if (raw && isSupportedCountry(raw) && selected.includes(raw)) return raw;
  } catch {
    /* */
  }
  return selected.includes(fallback) ? fallback : (selected[0] ?? fallback);
}

export function writePersistedActiveCountry(code: SupportedCountryCode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PLAYSTORE_ACTIVE_COUNTRY_STORAGE, code);
  } catch {
    /* */
  }
}

export function sanitizeSelectedCountries(
  codes: SupportedCountryCode[],
  fallback: SupportedCountryCode[],
): SupportedCountryCode[] {
  const unique = uniqueSupported(codes);
  return unique.length > 0 ? unique : fallback;
}
