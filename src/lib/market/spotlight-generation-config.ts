/** Explicit ceiling for gemini-2.5-flash Keyword Spotlight structured JSON. */
export const KEYWORD_SPOTLIGHT_MAX_OUTPUT_TOKENS = 16_384;

export const KEYWORD_SPOTLIGHT_GENERATION_CONFIG = {
  temperature: 0.4,
  topP: 0.9,
  maxOutputTokens: KEYWORD_SPOTLIGHT_MAX_OUTPUT_TOKENS,
  responseMimeType: "application/json" as const,
  thinkingConfig: { thinkingBudget: 0 },
};
