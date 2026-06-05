/**
 * Brand Kit Asset Selector
 *
 * Handles intelligent selection of brand kit assets (icons, banners, screenshots)
 * based on language, with fallback strategies for missing language variants.
 *
 * Features:
 * - Language-specific asset selection (e.g., Arabic screenshots vs English)
 * - Fallback to base language (ar-SA → ar)
 * - Fallback to English as last resort
 * - Type-safe asset extraction from metadata
 */

/**
 * Brand Kit metadata structure
 */
export interface BrandKit {
  app_icon?: string;
  banners?: string[];
  screenshots?: {
    [language: string]: string[];
  };
}

/**
 * Get screenshots for a specific language with intelligent fallback
 *
 * Selection priority:
 * 1. Exact language match (e.g., "ar-SA" → screenshots.ar-SA)
 * 2. Language base (e.g., "ar-SA" → screenshots.ar)
 * 3. English fallback (screenshots.en)
 * 4. Empty array if none found
 *
 * @param brandKit Brand kit metadata (may be undefined)
 * @param language Language code (e.g., "ar", "en", "ar-SA")
 * @returns Array of screenshot URLs for the language
 */
export function getScreenshotsForLanguage(
  brandKit: BrandKit | undefined,
  language: string
): string[] {
  if (!brandKit?.screenshots) {
    return [];
  }

  const screenshots = brandKit.screenshots;

  // 1. Try exact match first
  if (screenshots[language]) {
    return screenshots[language];
  }

  // 2. Try base language (split by hyphen)
  const langBase = language.split("-")[0].toLowerCase();
  if (screenshots[langBase]) {
    return screenshots[langBase];
  }

  // 3. Fall back to English
  if (screenshots["en"]) {
    return screenshots["en"];
  }

  // 4. Return empty array if nothing found
  return [];
}

/**
 * Get the primary banner for a specific language
 *
 * Selection priority:
 * 1. Language-suffixed banner (e.g., "-ar", "_ar" for Arabic)
 * 2. Language-base suffixed banner (e.g., "-ar" for "ar-SA")
 * 3. First available banner
 * 4. Undefined if no banners exist
 *
 * @param brandKit Brand kit metadata
 * @param language Language code
 * @returns Banner URL or undefined if not found
 */
export function getBannerForLanguage(
  brandKit: BrandKit | undefined,
  language: string
): string | undefined {
  if (!brandKit?.banners || brandKit.banners.length === 0) {
    return undefined;
  }

  const banners = brandKit.banners;

  // 1. Look for language-specific suffix
  const langBase = language.split("-")[0].toLowerCase();
  const langSuffixBanner = banners.find((url) =>
    new RegExp(`[-_]${langBase}([.-]|$)`, "i").test(url)
  );

  if (langSuffixBanner) {
    return langSuffixBanner;
  }

  // 2. Fall back to first banner
  return banners[0];
}

/**
 * Get the app icon URL
 *
 * @param brandKit Brand kit metadata
 * @returns App icon URL or undefined
 */
export function getAppIcon(brandKit: BrandKit | undefined): string | undefined {
  return brandKit?.app_icon;
}

/**
 * Check if brand kit has any assets
 *
 * @param brandKit Brand kit metadata
 * @returns true if any assets are present
 */
export function hasBrandKitAssets(brandKit: BrandKit | undefined): boolean {
  if (!brandKit) {
    return false;
  }

  return !!(
    brandKit.app_icon ||
    (brandKit.banners && brandKit.banners.length > 0) ||
    (brandKit.screenshots && Object.keys(brandKit.screenshots).length > 0)
  );
}

/**
 * Get all unique languages available in screenshots
 *
 * @param brandKit Brand kit metadata
 * @returns Array of language codes available in screenshots
 */
export function getAvailableLanguages(brandKit: BrandKit | undefined): string[] {
  if (!brandKit?.screenshots) {
    return [];
  }

  return Object.keys(brandKit.screenshots);
}

/**
 * Validate that all screenshots in a language exist
 *
 * Useful for checking if a language variant is complete
 *
 * @param brandKit Brand kit metadata
 * @param language Language code
 * @returns true if language has screenshots, false otherwise
 */
export function hasLanguageVariant(
  brandKit: BrandKit | undefined,
  language: string
): boolean {
  if (!brandKit?.screenshots) {
    return false;
  }

  const screenshots = getScreenshotsForLanguage(brandKit, language);
  return screenshots.length > 0;
}

/**
 * Get screenshot count for a language
 *
 * @param brandKit Brand kit metadata
 * @param language Language code
 * @returns Number of screenshots available for the language
 */
export function getScreenshotCount(
  brandKit: BrandKit | undefined,
  language: string
): number {
  return getScreenshotsForLanguage(brandKit, language).length;
}

/**
 * Get the highest quality screenshot for a language
 *
 * Assumes screenshots are ordered by quality (first = best)
 *
 * @param brandKit Brand kit metadata
 * @param language Language code
 * @returns First (highest quality) screenshot or undefined
 */
export function getPrimaryScreenshot(
  brandKit: BrandKit | undefined,
  language: string
): string | undefined {
  const screenshots = getScreenshotsForLanguage(brandKit, language);
  return screenshots[0];
}

/**
 * Get a specific screenshot by index for a language
 *
 * @param brandKit Brand kit metadata
 * @param language Language code
 * @param index Screenshot index (0-based)
 * @returns Screenshot URL or undefined if index out of bounds
 */
export function getScreenshotByIndex(
  brandKit: BrandKit | undefined,
  language: string,
  index: number
): string | undefined {
  const screenshots = getScreenshotsForLanguage(brandKit, language);
  return screenshots[index];
}

/**
 * Extract brand kit from metadata
 *
 * Safely extracts brand_kit object from metadata JSONB field
 *
 * @param metadata Metadata object from staging vault
 * @returns Brand kit or undefined if not present
 */
export function extractBrandKit(metadata: any): BrandKit | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const brandKit = metadata.brand_kit;

  if (!brandKit || typeof brandKit !== "object") {
    return undefined;
  }

  return brandKit as BrandKit;
}

/**
 * Validate brand kit structure
 *
 * Checks that brand kit has expected shape
 *
 * @param brandKit Brand kit object
 * @returns true if valid structure
 */
export function isValidBrandKit(brandKit: any): boolean {
  if (!brandKit || typeof brandKit !== "object") {
    return false;
  }

  // Must have at least one of: icon, banners, or screenshots
  const hasIcon = typeof brandKit.app_icon === "string";
  const hasBanners =
    Array.isArray(brandKit.banners) && brandKit.banners.length > 0;
  const hasScreenshots =
    typeof brandKit.screenshots === "object" &&
    brandKit.screenshots !== null &&
    Object.keys(brandKit.screenshots).length > 0;

  return hasIcon || hasBanners || hasScreenshots;
}

/**
 * Create a summary of brand kit assets
 *
 * Useful for logging and debugging
 *
 * @param brandKit Brand kit metadata
 * @returns Summary object with asset counts and languages
 */
export function getBrandKitSummary(brandKit: BrandKit | undefined) {
  return {
    hasIcon: !!brandKit?.app_icon,
    bannerCount: brandKit?.banners?.length || 0,
    availableLanguages: getAvailableLanguages(brandKit),
    totalScreenshots: Object.values(brandKit?.screenshots || {}).reduce(
      (sum, screens) => sum + (Array.isArray(screens) ? screens.length : 0),
      0
    ),
  };
}
