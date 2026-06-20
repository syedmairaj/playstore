/**
 * Robust JSON parsing for LLM output (EN/AR UTF-8 safe — structural edits only).
 */

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/** Extract substring from first `{` through last `}`. */
function extractObjectBlock(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1);
}

/** Balance dangling strings, brackets, and braces after token-limit truncation. */
function balanceJsonStructure(text: string): string {
  let s = text.trim().replace(/,\s*$/, "");
  if (!s) return s;

  let inString = false;
  let escapeNext = false;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
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

  if (inString) {
    const lastQuote = s.lastIndexOf('"');
    if (lastQuote > 0) {
      s = s.slice(0, lastQuote + 1);
      braceDepth = 0;
      bracketDepth = 0;
      inString = false;
      escapeNext = false;
      for (let i = 0; i < s.length; i++) {
        const char = s[i];
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
    }
  }

  s = s.replace(/,\s*$/, "");
  if (bracketDepth > 0) s += "]".repeat(bracketDepth);
  if (braceDepth > 0) s += "}".repeat(braceDepth);

  return s;
}

/**
 * Pad truncated modular long JSON when `features` array was started but cut off.
 * Closes open strings/arrays/objects, then adds minimal hook/closing siblings if missing.
 */
export function padTruncatedModularLongJson(text: string): string {
  if (!/"features"\s*:/i.test(text)) return text;

  let s = text.trim().replace(/,\s*$/, "");

  if ((s.match(/"/g) ?? []).length % 2 !== 0) {
    s += '"';
  }

  const stack: Array<"{" | "["> = [];
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < s.length; i++) {
    const char = s[i];
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
      if (char === "{") stack.push("{");
      else if (char === "[") stack.push("[");
      else if (char === "}" && stack[stack.length - 1] === "{") stack.pop();
      else if (char === "]" && stack[stack.length - 1] === "[") stack.pop();
    }
  }

  s = s.replace(/,\s*$/, "");

  while (stack.length > 0) {
    const open = stack.pop();
    s += open === "[" ? "]" : "}";
  }

  if (!/"hook"\s*:/i.test(s)) {
    const lastBrace = s.lastIndexOf("}");
    if (lastBrace > 0) {
      s = `${s.slice(0, lastBrace)},"hook":""${s.slice(lastBrace)}`;
    } else {
      s += ',"hook":""';
    }
  }
  if (!/"closing"\s*:/i.test(s)) {
    const lastBrace = s.lastIndexOf("}");
    if (lastBrace > 0) {
      s = `${s.slice(0, lastBrace)},"closing":""${s.slice(lastBrace)}`;
    } else {
      s += ',"closing":""';
    }
  }

  if (!s.trim().endsWith("}")) {
    s += "}";
  }

  return s;
}

function tryParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function healJsonCandidates(candidate: string): string[] {
  const attempts = new Set<string>();
  attempts.add(candidate);
  attempts.add(balanceJsonStructure(candidate));
  attempts.add(padTruncatedModularLongJson(candidate));
  attempts.add(padTruncatedModularLongJson(balanceJsonStructure(candidate)));
  return [...attempts];
}

/**
 * Parse model JSON with fence stripping, object extraction, and structural balancing.
 * Returns `null` only when parsing is impossible.
 */
export function robustParseJson(raw: string): unknown | null {
  if (!raw || typeof raw !== "string") return null;

  const stripped = stripCodeFences(raw.trim());
  if (!stripped) return null;

  const candidates = new Set<string>();
  candidates.add(stripped);

  const objectBlock = extractObjectBlock(stripped);
  if (objectBlock) candidates.add(objectBlock);

  if (!stripped.trim().endsWith("}")) {
    candidates.add(padTruncatedModularLongJson(stripped));
  }

  for (const candidate of candidates) {
    for (const healed of healJsonCandidates(candidate)) {
      if (!healed) continue;
      const parsed = tryParse(healed);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}
