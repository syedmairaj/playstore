/**
 * Default Serper `gl` / `hl` pairs for Google Play–indexed search previews.
 *
 * - **India (`in`)**: `gl=in`, primary `hl=en`. Hindi (`hl: "hi"`) is a plausible
 *   future override once validated in Serper responses.
 * - **China — global Play (`cn`)**: `gl=cn`, `hl=en`. If organic Play results are
 *   noticeably cleaner with `hl: "zh-CN"`, validate with Serper before switching.
 *   Worldwide vs mainland Play nuances belong in UI disclaimers (`serperPreview.*`),
 *   not in API payloads.
 */

export type SerperRegionGlHl = { gl: string; hl: string };

export const SERPER_PLAY_REGION_DEFAULTS = {
  us: { gl: "us", hl: "en" },
  sa: { gl: "sa", hl: "ar" },
  ae: { gl: "ae", hl: "en" },
  in: { gl: "in", hl: "en" },
  cn: { gl: "cn", hl: "en" },
} as const satisfies Record<string, SerperRegionGlHl>;
