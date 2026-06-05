/**
 * RTL (Right-to-Left) Language Detection and Direction Utilities
 *
 * Detects languages that use RTL text direction and provides direction values
 * for use in HTML `dir` attributes and CSS directionality.
 *
 * Supported RTL languages:
 * - Arabic (ar)
 * - Hebrew (he)
 * - Persian/Farsi (fa)
 * - Urdu (ur)
 */

/**
 * Check if a language code is RTL
 * @param language Language code (e.g., "ar", "en", "ar-SA")
 * @returns true if language is RTL, false otherwise
 */
export function isRTLLanguage(language?: string): boolean {
  const rtlLanguages = ["ar", "he", "fa", "ur"];
  const langBase = language?.toLowerCase().split("-")[0] || "";
  return rtlLanguages.includes(langBase);
}

/**
 * Get the text direction for a language
 * @param language Language code (e.g., "ar", "en")
 * @returns "rtl" for RTL languages, "ltr" for others
 */
export function getLanguageDirection(language?: string): "rtl" | "ltr" {
  return isRTLLanguage(language) ? "rtl" : "ltr";
}

/**
 * Get CSS class for text direction
 * Useful for Tailwind or other CSS frameworks
 * @param language Language code
 * @returns CSS class string for directionality
 */
export function getDirectionClass(language?: string): string {
  return isRTLLanguage(language) ? "rtl" : "ltr";
}

/**
 * Get margin/padding alignment utilities based on language
 * Example: "text-end" for RTL, "text-start" for LTR
 * @param language Language code
 * @returns Object with alignment utilities
 */
export function getAlignmentUtilities(language?: string) {
  const isRTL = isRTLLanguage(language);

  return {
    textAlign: isRTL ? "text-right" : "text-left",
    textEnd: "text-end",
    textStart: "text-start",
    marginStart: isRTL ? "mr" : "ml",
    marginEnd: isRTL ? "ml" : "mr",
    paddingStart: isRTL ? "pr" : "pl",
    paddingEnd: isRTL ? "pl" : "pr",
    isRTL,
  };
}

/**
 * Get flexbox direction based on language
 * @param language Language code
 * @returns "flex-row-reverse" for RTL, "flex-row" for LTR
 */
export function getFlexDirection(language?: string): "flex-row" | "flex-row-reverse" {
  return isRTLLanguage(language) ? "flex-row-reverse" : "flex-row";
}

/**
 * Format a string with language-specific formatting
 * @param text Text to format
 * @param language Language code
 * @returns Formatted text with unicode directional marks if needed
 */
export function formatTextWithDirection(text: string, language?: string): string {
  const isRTL = isRTLLanguage(language);

  // Add Unicode directional marks for mixed content
  const RLE = "‪"; // Right-to-Left Embedding
  const LRE = "‭"; // Left-to-Right Embedding
  const PDF = "‬"; // Pop Directional Formatting

  // For strongly RTL text, embed with RLE
  if (isRTL) {
    return `${RLE}${text}${PDF}`;
  }

  // For LTR, no special formatting needed
  return text;
}

/**
 * Get language-specific font stack
 * @param language Language code
 * @returns Font family string appropriate for language
 */
export function getLanguageFontStack(language?: string): string {
  const isRTL = isRTLLanguage(language);

  // Arabic requires specific fonts for proper rendering
  if (isRTL && language?.startsWith("ar")) {
    return "'Segoe UI', 'Tahoma', 'Arial', 'Traditional Arabic', 'Simplified Arabic', sans-serif";
  }

  // Hebrew
  if (language?.startsWith("he")) {
    return "'Segoe UI', 'Arial', 'David', sans-serif";
  }

  // Persian/Farsi
  if (language?.startsWith("fa")) {
    return "'Segoe UI', 'Tahoma', 'B Yekan', 'XB Yekan', sans-serif";
  }

  // Default for all others
  return "'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif";
}
