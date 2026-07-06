/**
 * Stub for the deprecated @google/generative-ai package.
 * The project migrated to @google/genai. This stub prevents test-collection
 * failures in files that transitively import the old package.
 */

export class GoogleGenerativeAI {
  constructor(_apiKey: string) {}
  getGenerativeModel(_options: unknown) {
    return {
      generateContent: async () => ({ response: { text: () => "" } }),
      generateContentStream: async () => ({
        stream: (async function* () {})(),
        response: Promise.resolve({ text: () => "" }),
      }),
    };
  }
}

export enum HarmCategory {
  HARM_CATEGORY_UNSPECIFIED = "HARM_CATEGORY_UNSPECIFIED",
  HARM_CATEGORY_HATE_SPEECH = "HARM_CATEGORY_HATE_SPEECH",
  HARM_CATEGORY_SEXUALLY_EXPLICIT = "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  HARM_CATEGORY_HARASSMENT = "HARM_CATEGORY_HARASSMENT",
  HARM_CATEGORY_DANGEROUS_CONTENT = "HARM_CATEGORY_DANGEROUS_CONTENT",
}

export enum HarmBlockThreshold {
  HARM_BLOCK_THRESHOLD_UNSPECIFIED = "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
  BLOCK_LOW_AND_ABOVE = "BLOCK_LOW_AND_ABOVE",
  BLOCK_MEDIUM_AND_ABOVE = "BLOCK_MEDIUM_AND_ABOVE",
  BLOCK_ONLY_HIGH = "BLOCK_ONLY_HIGH",
  BLOCK_NONE = "BLOCK_NONE",
}
