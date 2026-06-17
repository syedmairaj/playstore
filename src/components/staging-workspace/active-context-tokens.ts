/** Premium Active Context tokens — sectional gravity, card-less structure. */

/** Gap from previous section's last row to this zone's rule (40px). */
export const ACTIVE_CONTEXT_SECTION_ZONE_GAP = "mt-10";

/** 1px structural anchor between modules. */
export const ACTIVE_CONTEXT_SECTION_ZONE_RULE = "border-t border-[#2a2a2a]";

/** Space from rule to section header title unit (24px). */
export const ACTIVE_CONTEXT_SECTION_ZONE_HEADER_PAD = "pt-6";

/** Combined zone opener — rule + header breathing room after prior section. */
export const ACTIVE_CONTEXT_SECTION_ZONE = [
  ACTIVE_CONTEXT_SECTION_ZONE_GAP,
  ACTIVE_CONTEXT_SECTION_ZONE_RULE,
  ACTIVE_CONTEXT_SECTION_ZONE_HEADER_PAD,
].join(" ");

export const ACTIVE_CONTEXT_HEADER_CLASS =
  "text-[13px] font-bold tracking-[0.04em] text-white/95";

export const ACTIVE_CONTEXT_HEADER_CLASS_AR =
  "font-arabic text-[13px] font-bold text-white/95";

export const ACTIVE_CONTEXT_DESCRIPTION_CLASS =
  "text-[11px] font-normal leading-relaxed text-white/30";

/** Title row → description within a section header unit. */
export const ACTIVE_CONTEXT_TITLE_UNIT_GAP = "mt-1.5";

/** Header unit → signal list. */
export const ACTIVE_CONTEXT_HEADER_UNIT_BOTTOM = "mb-4";

/** Default row height for premium spacing in signal lists. */
export const ACTIVE_CONTEXT_ROW_MIN_HEIGHT = 40;

/** Extra vertical gap baked into scroll max-height per row. */
export const ACTIVE_CONTEXT_ROW_GAP = 8;

export const ACTIVE_CONTEXT_ROW_HOVER =
  "rounded-lg transition-all duration-300 ease-out hover:bg-white/[0.04]";

export const ACTIVE_CONTEXT_ROW_DIVIDER = "border-b border-white/[0.04]";

/** Section header icon — 16px monoline, 1.5px stroke, 10px gap to title. */
export const ACTIVE_CONTEXT_HEADER_ICON_SIZE_PX = 16;
export const ACTIVE_CONTEXT_HEADER_ICON_STROKE = 1.5;
export const ACTIVE_CONTEXT_HEADER_ICON_GAP = "gap-2.5";

/**
 * Module header icon colors (hex) — locale-agnostic; RTL mirrors layout only.
 */
export const ACTIVE_CONTEXT_MODULE_ICON_COLOR = {
  keywordTracker: "#3B82F6",
  reviewInsights: "#F59E0B",
  marketIntel: "#10B981",
  competitor: "#8B5CF6",
} as const;

export type ActiveContextModuleId = keyof typeof ACTIVE_CONTEXT_MODULE_ICON_COLOR;
