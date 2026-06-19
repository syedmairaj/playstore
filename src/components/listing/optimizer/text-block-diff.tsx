"use client";

import { cn } from "@/lib/utils";

type DiffToken = { type: "same" | "add" | "remove"; text: string };

function tokenizeWords(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

/** Simple word-level diff for compare-with-previous UI. */
export function diffWords(previous: string, current: string): DiffToken[] {
  const a = tokenizeWords(previous);
  const b = tokenizeWords(current);
  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      tokens.push({ type: "same", text: a[i]! });
      i += 1;
      j += 1;
      continue;
    }
    const nextInB = j + 1 < b.length ? b[j + 1] : undefined;
    const nextInA = i + 1 < a.length ? a[i + 1] : undefined;
    if (i < a.length && nextInB === a[i]) {
      tokens.push({ type: "add", text: b[j]! });
      j += 1;
    } else if (j < b.length && nextInA === b[j]) {
      tokens.push({ type: "remove", text: a[i]! });
      i += 1;
    } else if (i < a.length && j < b.length) {
      tokens.push({ type: "remove", text: a[i]! });
      tokens.push({ type: "add", text: b[j]! });
      i += 1;
      j += 1;
    } else if (i < a.length) {
      tokens.push({ type: "remove", text: a[i]! });
      i += 1;
    } else if (j < b.length) {
      tokens.push({ type: "add", text: b[j]! });
      j += 1;
    }
  }

  return tokens;
}

export function TextBlockDiff({
  previous,
  current,
  isRtl = false,
}: {
  previous: string;
  current: string;
  isRtl?: boolean;
}) {
  const tokens = diffWords(previous, current);

  return (
    <p
      className={cn(
        "whitespace-pre-wrap rounded-lg border border-zinc-700/80 bg-black/40 p-3 text-sm leading-relaxed",
        isRtl && "text-end",
      )}
    >
      {tokens.map((token, idx) => (
        <span
          key={`${token.type}-${idx}`}
          className={cn(
            token.type === "add" && "bg-emerald-500/25 text-emerald-100",
            token.type === "remove" &&
              "bg-red-500/20 text-red-200/90 line-through decoration-red-400/80",
            token.type === "same" && "text-white/85",
          )}
        >
          {token.text}
        </span>
      ))}
    </p>
  );
}
