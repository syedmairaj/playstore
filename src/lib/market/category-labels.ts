/**
 * Human-readable labels for Google Play category IDs.
 *
 * Also provides a fuzzy-mapper that converts free-text category strings
 * (as stored in listing_generations.category or apps.category) to a canonical
 * gplay category ID so the Top Charts feature can auto-select the right chart.
 */

export const GPLAY_CATEGORY_LABELS: Record<string, string> = {
  APPLICATION: "All Apps",
  ART_AND_DESIGN: "Art & Design",
  AUTO_AND_VEHICLES: "Auto & Vehicles",
  BEAUTY: "Beauty",
  BOOKS_AND_REFERENCE: "Books & Reference",
  BUSINESS: "Business",
  COMICS: "Comics",
  COMMUNICATION: "Communication",
  DATING: "Dating",
  EDUCATION: "Education",
  ENTERTAINMENT: "Entertainment",
  EVENTS: "Events",
  FINANCE: "Finance",
  FOOD_AND_DRINK: "Food & Drink",
  HEALTH_AND_FITNESS: "Health & Fitness",
  HOUSE_AND_HOME: "House & Home",
  LIBRARIES_AND_DEMO: "Libraries & Demo",
  LIFESTYLE: "Lifestyle",
  MAPS_AND_NAVIGATION: "Maps & Navigation",
  MEDICAL: "Medical",
  MUSIC_AND_AUDIO: "Music & Audio",
  NEWS_AND_MAGAZINES: "News & Magazines",
  PARENTING: "Parenting",
  PERSONALIZATION: "Personalization",
  PHOTOGRAPHY: "Photography",
  PRODUCTIVITY: "Productivity",
  SHOPPING: "Shopping",
  SOCIAL: "Social",
  SPORTS: "Sports",
  TOOLS: "Tools",
  TRAVEL_AND_LOCAL: "Travel & Local",
  VIDEO_PLAYERS: "Video Players",
  WEATHER: "Weather",
  GAME: "Games",
  GAME_ACTION: "Action Games",
  GAME_ADVENTURE: "Adventure Games",
  GAME_ARCADE: "Arcade Games",
  GAME_BOARD: "Board Games",
  GAME_CARD: "Card Games",
  GAME_CASINO: "Casino Games",
  GAME_CASUAL: "Casual Games",
  GAME_EDUCATIONAL: "Educational Games",
  GAME_MUSIC: "Music Games",
  GAME_PUZZLE: "Puzzle Games",
  GAME_RACING: "Racing Games",
  GAME_ROLE_PLAYING: "Role Playing Games",
  GAME_SIMULATION: "Simulation Games",
  GAME_SPORTS: "Sports Games",
  GAME_STRATEGY: "Strategy Games",
  GAME_TRIVIA: "Trivia Games",
  GAME_WORD: "Word Games",
  FAMILY: "Family",
};

/** All selectable category IDs for the UI picker (excludes catch-all APPLICATION). */
export const SELECTABLE_CATEGORIES = Object.keys(GPLAY_CATEGORY_LABELS).filter(
  (k) => k !== "APPLICATION",
);

/**
 * Maps a free-text category (e.g. "health & fitness", "Health_And_Fitness",
 * "Health and Fitness") to a canonical gplay category ID.
 *
 * Returns "APPLICATION" as a safe fallback (all apps).
 */
export function resolveCategoryId(raw: string | null | undefined): string {
  if (!raw) return "APPLICATION";

  // Direct match (already a valid key)
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (upper in GPLAY_CATEGORY_LABELS) return upper;

  // Fuzzy: normalize spaces/hyphens/underscores and compare
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_&-]+/g, "");
  const target = normalize(raw);
  for (const key of Object.keys(GPLAY_CATEGORY_LABELS)) {
    if (normalize(GPLAY_CATEGORY_LABELS[key]) === target) return key;
    if (normalize(key) === target) return key;
  }

  // Partial match fallback
  for (const key of Object.keys(GPLAY_CATEGORY_LABELS)) {
    if (normalize(GPLAY_CATEGORY_LABELS[key]).includes(target)) return key;
  }

  return "APPLICATION";
}

export function getCategoryLabel(id: string): string {
  return GPLAY_CATEGORY_LABELS[id] ?? id;
}
