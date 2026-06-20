/**
 * JSON Recovery Utility
 *
 * Handles truncated JSON responses from Gemini by identifying the last valid
 * closing brace/bracket and safely recovering partial structures.
 *
 * Maintains RTL/LTR parity — no text transformation, only structural recovery.
 */

import { robustParseJson } from "@/lib/utils/json-repair";

/**
 * Recover partial/truncated JSON by finding the last valid closing brace/bracket
 *
 * Strategy:
 * 1. Scan backward from the end for a closing brace (}) or bracket (])
 * 2. Once found, validate that it's not escaped (\") and belongs to the root object/array
 * 3. Return the substring up to and including that closing delimiter
 * 4. Let JSON.parse handle the recovered string
 *
 * This preserves all UTF-8 characters (including Arabic RTL text) since we only
 * trim the malformed trailing portion, never modifying the actual text content.
 *
 * @param truncatedJson - The truncated JSON string from Gemini
 * @returns Recovered JSON string, or null if no valid recovery possible
 */
export function recoverPartialJson(truncatedJson: string): string | null {
  if (!truncatedJson || typeof truncatedJson !== "string") {
    return null;
  }

  const trimmed = truncatedJson.trim();
  if (!trimmed) {
    return null;
  }

  // Determine if we're dealing with an object or array
  const startsWithObject = trimmed[0] === "{";
  const startsWithArray = trimmed[0] === "[";

  if (!startsWithObject && !startsWithArray) {
    // Not JSON
    return null;
  }

  const targetClosing = startsWithObject ? "}" : "]";
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;
  let escapeNext = false;

  // Scan forward to track nesting depth
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === "\\") {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") braceDepth++;
      else if (char === "}") braceDepth--;
      else if (char === "[") bracketDepth++;
      else if (char === "]") bracketDepth--;
    }
  }

  // Scan backward to find the last valid closing delimiter
  let closingIndex = -1;
  inString = false;
  escapeNext = false;

  for (let i = trimmed.length - 1; i >= 0; i--) {
    const char = trimmed[i];

    // Scan backward: need to track strings carefully
    // Count escapes: if we're at position i with \, the char at i is escaped if
    // we have an odd number of backslashes before it
    let numBackslashes = 0;
    for (let j = i - 1; j >= 0 && trimmed[j] === "\\"; j--) {
      numBackslashes++;
    }
    const isEscaped = numBackslashes % 2 === 1;

    if (char === '"' && !isEscaped) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (startsWithObject && char === "}") {
        closingIndex = i;
        break;
      }
      if (startsWithArray && char === "]") {
        closingIndex = i;
        break;
      }
    }
  }

  if (closingIndex === -1) {
    // No closing brace/bracket found
    return null;
  }

  // Return the substring including the closing delimiter
  return trimmed.substring(0, closingIndex + 1);
}

/**
 * Attempt to parse JSON, with fallback to recovery
 *
 * @param jsonText - Raw JSON string (possibly truncated)
 * @returns Parsed object, or null if both parse and recovery fail
 */
export function parseJsonWithRecovery<T = unknown>(jsonText: string): T | null {
  return robustParseJson(jsonText) as T | null;
}

/**
 * Type-safe wrapper for sentiment analysis JSON recovery
 *
 * Ensures recovered object has the required fields, filling missing arrays with [].
 */
export function recoverSentimentJson(jsonText: string): {
  topPraiseKeywords: string[];
  reportedBugsKeywords: string[];
  featureRequestsKeywords: string[];
} | null {
  const parsed = parseJsonWithRecovery<{
    topPraiseKeywords?: unknown;
    reportedBugsKeywords?: unknown;
    featureRequestsKeywords?: unknown;
  }>(jsonText);

  if (!parsed) {
    return null;
  }

  return {
    topPraiseKeywords: Array.isArray(parsed.topPraiseKeywords)
      ? parsed.topPraiseKeywords.slice(0, 6).map(String)
      : [],
    reportedBugsKeywords: Array.isArray(parsed.reportedBugsKeywords)
      ? parsed.reportedBugsKeywords.slice(0, 6).map(String)
      : [],
    featureRequestsKeywords: Array.isArray(parsed.featureRequestsKeywords)
      ? parsed.featureRequestsKeywords.slice(0, 6).map(String)
      : [],
  };
}
