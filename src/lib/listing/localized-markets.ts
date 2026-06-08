/** Supported listing localization targets (expand as needed). */
export const LOCALIZE_MARKETS = ["ae", "in", "mx"] as const;
export type LocalizeMarketCode = (typeof LOCALIZE_MARKETS)[number];

export const MARKET_META: Record<
  LocalizeMarketCode,
  { language: string; locale: string; rtl: boolean; label: string; flag: string }
> = {
  ae: {
    language: "Arabic",
    locale: "ar-AE",
    rtl: true,
    label: "UAE (Arabic)",
    flag: "🇦🇪",
  },
  in: {
    language: "Hindi",
    locale: "hi-IN",
    rtl: false,
    label: "India (Hindi)",
    flag: "🇮🇳",
  },
  mx: {
    language: "Spanish",
    locale: "es-MX",
    rtl: false,
    label: "Latin America (Spanish)",
    flag: "🇲🇽",
  },
};

export type LocalizedMarketRecord = {
  market: LocalizeMarketCode;
  label: string;
  rtl: boolean;
  title: string;
  shortDescription: string;
  longDescription: string;
  keywords: string[];
  updatedAt?: string;
};

export function isLocalizeMarketCode(value: string): value is LocalizeMarketCode {
  return (LOCALIZE_MARKETS as readonly string[]).includes(value);
}

export function marketRecordFromCode(
  market: LocalizeMarketCode,
  fields: Omit<LocalizedMarketRecord, "market" | "label" | "rtl">,
): LocalizedMarketRecord {
  const meta = MARKET_META[market];
  return {
    market,
    label: meta.label,
    rtl: meta.rtl,
    ...fields,
  };
}
