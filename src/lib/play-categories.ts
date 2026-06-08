/**
 * Common Google Play primary categories (display labels).
 * Keep aligned with Play Console taxonomy where practical.
 */
const ALL_PLAY_CATEGORIES_ALPHABETICAL: readonly string[] = [
  "Art & Design",
  "Auto & Vehicles",
  "Beauty",
  "Books & Reference",
  "Business",
  "Comics",
  "Communication",
  "Dating",
  "Education",
  "Entertainment",
  "Events",
  "Finance",
  "Food & Drink",
  "Health & Fitness",
  "House & Home",
  "Libraries & Demo",
  "Lifestyle",
  "Maps & Navigation",
  "Medical",
  "Music & Audio",
  "News & Magazines",
  "Parenting",
  "Personalization",
  "Photography",
  "Productivity",
  "Shopping",
  "Social",
  "Sports",
  "Tools",
  "Travel & Local",
  "Video Players & Editors",
  "Weather",
] as const;

/** Shown first in add-app / ASO pickers for common verticals. */
const PLAY_CATEGORY_PRIORITY_FIRST: readonly string[] = [
  "Productivity",
  "Health & Fitness",
  "Tools",
  "Education",
  "Entertainment",
  "Social",
  "Finance",
] as const;

const prioritySet = new Set<string>(PLAY_CATEGORY_PRIORITY_FIRST);

export const PLAY_STORE_CATEGORIES: readonly string[] = [
  ...PLAY_CATEGORY_PRIORITY_FIRST.filter((c) =>
    ALL_PLAY_CATEGORIES_ALPHABETICAL.includes(c),
  ),
  ...ALL_PLAY_CATEGORIES_ALPHABETICAL.filter((c) => !prioritySet.has(c)),
] as const;
