/**
 * Mood Schema Framework — Pre-Validated Aesthetic Schemas
 *
 * These 5 schemas define deterministic color palettes, typography, and shadow profiles.
 * Gemini selects from these schemas; it does NOT invent colors.
 * Each schema maps to a pre-built asset set for sharp compositing.
 */

export type MoodSchemaType =
  | "minimalist-professional"
  | "energetic-tech"
  | "organic-health"
  | "high-contrast-bold"
  | "luxury-premium";

export type FontStyle = "bold" | "elegant" | "clean";
export type ShadowProfile = "sharp" | "soft-spread" | "subtle" | "hard-edge" | "deep";

export interface MoodSchema {
  id: MoodSchemaType;
  label: string;
  description: string;
  primaryColor: string;      // Primary palette hex
  secondaryColor: string;    // Secondary palette hex
  fontStyle: FontStyle;      // Typography personality
  shadowProfile: ShadowProfile;  // Shadow rendering style
  aestheticKeywords: string[]; // FLUX-ready descriptors
  categoryAffinities: string[]; // App categories this schema suits
  luminance: "dark" | "light"; // Overall background luminance
}

/**
 * Pre-validated Mood Schemas — Single source of truth for brand identities
 * Each schema is locked: Gemini can only SELECT, not CREATE.
 */
export const MOOD_SCHEMAS: Record<MoodSchemaType, MoodSchema> = {
  "minimalist-professional": {
    id: "minimalist-professional",
    label: "Minimalist Professional",
    description: "Ultra-clean, premium, corporate trust. Grayscale/deep navy foundation.",
    primaryColor: "#1E293B",      // Slate-900
    secondaryColor: "#64748B",    // Slate-500
    fontStyle: "clean",
    shadowProfile: "sharp",
    aestheticKeywords: [
      "ultra-clean white space",
      "minimal geometric forms",
      "sharp edges",
      "professional restraint",
      "1-2 color palette",
      "high contrast",
      "generous negative space",
      "corporate premium aesthetic",
      "refined typography",
      "intentional composition",
    ],
    categoryAffinities: [
      "finance", "banking", "fintech", "investment",
      "business", "productivity", "tools", "utilities",
      "professional-services", "corporate"
    ],
    luminance: "light",
  },

  "energetic-tech": {
    id: "energetic-tech",
    label: "Energetic Tech",
    description: "Bold, vibrant, cutting-edge. Electric gradients and dynamic energy.",
    primaryColor: "#6366F1",      // Indigo-500
    secondaryColor: "#A855F7",    // Purple-500
    fontStyle: "bold",
    shadowProfile: "soft-spread",
    aestheticKeywords: [
      "electric gradient",
      "vibrant colour blocking",
      "dynamic diagonal bands",
      "bold geometric shapes",
      "contemporary energy",
      "tech-forward aesthetic",
      "glowing accents",
      "kinetic motion",
      "saturated palette",
      "modern digital design",
      "confident composition",
    ],
    categoryAffinities: [
      "tech", "apps", "software", "saas",
      "startup", "ai", "machine-learning",
      "gaming", "entertainment", "social",
      "communication", "messaging"
    ],
    luminance: "dark",
  },

  "organic-health": {
    id: "organic-health",
    label: "Organic Health",
    description: "Warm, natural, nurturing. Earthy and pastel tones.",
    primaryColor: "#0F766E",      // Teal-700
    secondaryColor: "#CCFBF1",    // Teal-100
    fontStyle: "clean",
    shadowProfile: "subtle",
    aestheticKeywords: [
      "earthy warm palette",
      "soft pastel tones",
      "organic flowing shapes",
      "natural textures",
      "gentle gradients",
      "wellness-focused aesthetic",
      "calming atmosphere",
      "botanical accents",
      "sustainable vibes",
      "human-centered design",
      "approachable trust",
    ],
    categoryAffinities: [
      "health", "fitness", "wellness", "medical",
      "nutrition", "food", "lifestyle",
      "meditation", "mindfulness", "mental-health",
      "ecology", "sustainability", "beauty"
    ],
    luminance: "light",
  },

  "high-contrast-bold": {
    id: "high-contrast-bold",
    label: "High-Contrast Bold",
    description: "Stark, attention-grabbing, edgy. Black/white + neon accent.",
    primaryColor: "#000000",      // Pure black
    secondaryColor: "#EF4444",    // Red-500 (neon accent)
    fontStyle: "bold",
    shadowProfile: "hard-edge",
    aestheticKeywords: [
      "high contrast black & white",
      "neon accent colour",
      "bold sans-serif typography",
      "stark composition",
      "maximum impact",
      "edgy aesthetic",
      "hard geometric shapes",
      "graphic design intensity",
      "eye-catching focal points",
      "punk rock energy",
      "rebellious confidence",
    ],
    categoryAffinities: [
      "gaming", "music", "entertainment", "fashion",
      "sports", "fitness", "lifestyle", "streetwear",
      "creative", "design", "alternative", "skateboard"
    ],
    luminance: "dark",
  },

  "luxury-premium": {
    id: "luxury-premium",
    label: "Luxury Premium",
    description: "Elegant, exclusive, high-end. Champagne, gold, dark metallics.",
    primaryColor: "#78350F",      // Amber-900 (dark metallic brown)
    secondaryColor: "#FDE68A",    // Amber-200 (champagne/gold)
    fontStyle: "elegant",
    shadowProfile: "deep",
    aestheticKeywords: [
      "luxury aesthetic",
      "champagne & gold accents",
      "dark metallic tones",
      "elegant serif typography",
      "sophisticated composition",
      "premium materials",
      "refined minimalism",
      "exclusive atmosphere",
      "timeless elegance",
      "high-end branding",
      "aspirational design",
    ],
    categoryAffinities: [
      "luxury", "fashion", "beauty", "jewelry",
      "finance-premium", "real-estate", "travel",
      "hospitality", "wellness-luxury", "automotive"
    ],
    luminance: "light",
  },
};

/**
 * Select the optimal Mood Schema for an app category.
 * Uses category-to-schema affinity mapping.
 */
export function selectMoodSchemaForCategory(category: string): MoodSchema {
  const categoryLower = category.toLowerCase().trim();

  // Direct match check
  for (const schema of Object.values(MOOD_SCHEMAS)) {
    if (schema.categoryAffinities.some(aff => aff.toLowerCase() === categoryLower)) {
      return schema;
    }
  }

  // Fuzzy match check (substring matching)
  for (const schema of Object.values(MOOD_SCHEMAS)) {
    if (schema.categoryAffinities.some(aff =>
      categoryLower.includes(aff.toLowerCase()) ||
      aff.toLowerCase().includes(categoryLower)
    )) {
      return schema;
    }
  }

  // Default fallback: Energetic Tech (most versatile for unknown categories)
  return MOOD_SCHEMAS["energetic-tech"];
}

/**
 * Get the list of valid schema IDs for Gemini constraint enforcement.
 */
export function getValidSchemaIds(): MoodSchemaType[] {
  return Object.keys(MOOD_SCHEMAS) as MoodSchemaType[];
}

/**
 * Format a schema for Gemini as a JSON constraint block.
 */
export function formatSchemaForGemini(schema: MoodSchema): string {
  return `
  {
    "id": "${schema.id}",
    "label": "${schema.label}",
    "primaryColor": "${schema.primaryColor}",
    "secondaryColor": "${schema.secondaryColor}",
    "fontStyle": "${schema.fontStyle}",
    "shadowProfile": "${schema.shadowProfile}"
  }`;
}
