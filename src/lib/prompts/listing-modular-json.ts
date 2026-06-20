/** Shared JSON API contract for listing-modular-v1.2 (EN/AR). */

export const MODULAR_OUTPUT_STRICTNESS = [
  "OUTPUT STRICTNESS: You are an API. Do not output anything except JSON.",
  "Your output must end with '}'.",
  "If you are forced to choose between completeness and length, truncate the text content, NOT the JSON structure.",
].join(" ");

export const MODULAR_JSON_API_CRITICAL_RULES = [
  MODULAR_OUTPUT_STRICTNESS,
  "No markdown backticks. No conversational text.",
].join(" ");

export const MODULAR_SHORT_JSON_INTERFACE = `interface ModularShortResponse {
  variations: Array<{
    type: "growth" | "conversion" | "utility";
    text: string;
  }>;
}`;

export const MODULAR_SHORT_JSON_CRITICAL = [
  MODULAR_JSON_API_CRITICAL_RULES,
  "Ensure the `variations` array ALWAYS has exactly 3 elements: one 'growth', one 'conversion', one 'utility'.",
].join(" ");

export const MODULAR_TITLE_JSON_INTERFACE = `interface ModularTitleResponse {
  title: string;
  lockedKeywords: string[];
}`;

export const MODULAR_LONG_JSON_INTERFACE = `interface ModularLongResponse {
  /** SCHEMA-FIRST: emit this array BEFORE hook or closing — most critical data. */
  features: Array<{ label: string; bullets: string[] }>;
  hook: string;
  closing: string;
}`;

export const MODULAR_LONG_HOOK_CLOSING_INTERFACE = `interface ModularLongHookClosingResponse {
  hook: string;
  closing: string;
}`;

export const MODULAR_LONG_FEATURES_ONLY_INTERFACE = `interface ModularLongFeaturesResponse {
  features: Array<{ label: string; bullets: string[] }>;
}`;

export const MODULAR_LONG_REDUCED_COMPLEXITY_RULES = [
  "COMPLEXITY REDUCTION: Fewer feature sections with shorter bullets.",
  "Write a punchy, 2-sentence hook and a single-sentence closing CTA.",
].join(" ");

export const MODULAR_LONG_STYLISTIC_RULES = [
  "STYLE (not length): Write a punchy, 2-sentence hook.",
  "Provide a detailed features list with emoji section labels and clear bullets.",
  "End with a concise, high-conversion closing CTA.",
  "Prioritize complete JSON structure — never truncate mid-array or mid-object.",
  "SCHEMA-FIRST: Write the complete `features` array BEFORE `hook` or `closing`.",
].join(" ");

/** @deprecated Length budgets removed — use MODULAR_LONG_STYLISTIC_RULES */
export const MODULAR_LONG_TOKEN_BUDGET_RULES = MODULAR_LONG_STYLISTIC_RULES;
