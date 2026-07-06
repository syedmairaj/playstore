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

  if (trimmed[0] !== "{" && trimmed[0] !== "[") {
    return null;
  }

  // Single forward pass: track open container stack and string state.
  // Also track whether the currently-open string is a key or a value so we can
  // decide the right recovery strategy when the input is truncated mid-string.
  const stack: Array<"{" | "["> = [];
  let inString = false;
  let escapeNext = false;
  // lastStructuralChar: the most recent non-whitespace structural character
  // outside any string. Used to distinguish key-strings (after '{' or ',')
  // from value-strings (after ':').
  let lastStructuralChar = "";
  // Position of the last safe structural break (last ',' or opening '{' / '['
  // at the outermost object level) — used to truncate a dangling key.
  let lastSafeBreak = 0; // start of first container
  // Track the index just after the last time the root container was closed.
  let lastRootCloseEnd = -1;

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
      if (!inString) {
        // Record where this new string starts so we can truncate back to it.
        // "Safe break" is the position of the last delimiter before this string.
        // We'll use lastSafeBreak to strip the dangling key if needed.
      }
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{" || char === "[") {
      stack.push(char as "{" | "[");
      lastStructuralChar = char;
      lastSafeBreak = i + 1;
    } else if (char === "}") {
      if (stack.length > 0 && stack[stack.length - 1] === "{") {
        stack.pop();
        if (stack.length === 0) lastRootCloseEnd = i + 1;
        lastStructuralChar = "}";
      }
    } else if (char === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === "[") {
        stack.pop();
        if (stack.length === 0) lastRootCloseEnd = i + 1;
        lastStructuralChar = "]";
      }
    } else if (char === ":") {
      lastStructuralChar = ":";
    } else if (char === ",") {
      lastStructuralChar = ",";
      lastSafeBreak = i; // position of the comma itself — we can cut here
    }
  }

  // Already valid (balanced) JSON — return only up to the root close.
  if (stack.length === 0) {
    return lastRootCloseEnd > 0 ? trimmed.substring(0, lastRootCloseEnd) : null;
  }

  if (inString) {
    // Truncated inside a string.  Determine if it is a VALUE string (after ':')
    // or a KEY string (after '{' or ',').
    // Inside an array every string is a value, so check the innermost container too.
    const innermostIsArray =
      stack.length > 0 && stack[stack.length - 1] === "[";
    const isValueString = lastStructuralChar === ":" || innermostIsArray;

    if (isValueString) {
      // Close the value string then close all open containers.
      let suffix = '"';
      for (let i = stack.length - 1; i >= 0; i--) {
        suffix += stack[i] === "{" ? "}" : "]";
      }
      return trimmed + suffix;
    } else {
      // We are mid-key — drop the incomplete key (back to the last safe break)
      // and close the open containers.
      const base = trimmed.substring(0, lastSafeBreak);
      let suffix = "";
      for (let i = stack.length - 1; i >= 0; i--) {
        suffix += stack[i] === "{" ? "}" : "]";
      }
      return base + suffix;
    }
  }

  // Not inside a string but containers are still open — close them.
  let suffix = "";
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += stack[i] === "{" ? "}" : "]";
  }
  return trimmed + suffix;
}

/**
 * Attempt to parse JSON, with fallback to recovery
 *
 * @param jsonText - Raw JSON string (possibly truncated)
 * @returns Parsed object, or null if both parse and recovery fail
 */
export function parseJsonWithRecovery<T = unknown>(jsonText: string): T | null {
  const direct = robustParseJson(jsonText) as T | null;
  if (direct !== null) return direct;

  // robustParseJson truncates at the last quote when the string is open, which
  // loses the partial value.  Try the structural forward-scan recovery instead.
  const recovered = recoverPartialJson(jsonText);
  if (!recovered) return null;
  try {
    return JSON.parse(recovered) as T;
  } catch {
    return null;
  }
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
