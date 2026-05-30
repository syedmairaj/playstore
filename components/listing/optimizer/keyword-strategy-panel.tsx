"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// ── Keyword category parser ───────────────────────────────────────────────────
// Handles both [competitive] and competitive: prefix formats from the model.
// Any keyword without a recognised prefix lands in the "general" bucket.

export type KeywordCategory = "competitive" | "intent" | "gap" | "general";

export type CategorisedKeyword = {
  raw: string;       // original string from model (with prefix)
  keyword: string;   // stripped keyword text
  category: KeywordCategory;
};

const CATEGORY_ALIASES: Record<string, KeywordCategory> = {
  competitive: "competitive",
  "high-volume": "competitive",
  "high volume": "competitive",
  volume: "competitive",
  intent: "intent",
  "intent-based": "intent",
  "long-tail": "intent",
  longtail: "intent",
  gap: "gap",
  "competitor-gap": "gap",
  "competitor gap": "gap",
  spy: "gap",
};

export function parseKeyword(raw: string): CategorisedKeyword {
  // Match [tag] keyword  OR  tag: keyword
  const bracketMatch = raw.match(/^\[([^\]]+)\]\s*(.+)$/);
  const colonMatch   = !bracketMatch && raw.match(/^([a-z\s-]+):\s*(.+)$/i);
  const match = bracketMatch ?? colonMatch;

  if (match) {
    const tag = match[1].trim().toLowerCase();
    const keyword = match[2].trim();
    const category = CATEGORY_ALIASES[tag] ?? "general";
    return { raw, keyword, category };
  }
  return { raw, keyword: raw.trim(), category: "general" };
}

export function categoriseKeywords(items: string[]): Record<KeywordCategory, CategorisedKeyword[]> {
  const buckets: Record<KeywordCategory, CategorisedKeyword[]> = {
    competitive: [],
    intent: [],
    gap: [],
    general: [],
  };
  for (const item of items) {
    const parsed = parseKeyword(item);
    buckets[parsed.category].push(parsed);
  }
  return buckets;
}

// ── Section config ────────────────────────────────────────────────────────────

type SectionConfig = {
  category: KeywordCategory;
  labelKey: string;
  descKey: string;
  chipColor: string;
  dotColor: string;
  headerColor: string;
  badgeColor: string;
};

const SECTIONS: SectionConfig[] = [
  {
    category: "competitive",
    labelKey: "competitive",
    descKey: "competitiveDesc",
    chipColor: "border-sky-500/25 bg-sky-500/10 text-sky-300 hover:border-sky-400/40 hover:bg-sky-500/15",
    dotColor: "bg-sky-400",
    headerColor: "text-sky-400",
    badgeColor: "bg-sky-500/15 text-sky-400 border-sky-500/25",
  },
  {
    category: "intent",
    labelKey: "intent",
    descKey: "intentDesc",
    chipColor: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400/40 hover:bg-emerald-500/15",
    dotColor: "bg-emerald-400",
    headerColor: "text-emerald-400",
    badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  },
  {
    category: "gap",
    labelKey: "gap",
    descKey: "gapDesc",
    chipColor: "border-amber-500/25 bg-amber-500/10 text-amber-300 hover:border-amber-400/40 hover:bg-amber-500/15",
    dotColor: "bg-amber-400",
    headerColor: "text-amber-400",
    badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  },
  {
    category: "general",
    labelKey: "general",
    descKey: "generalDesc",
    chipColor: "border-zinc-700/60 bg-zinc-800/60 text-zinc-300 hover:border-zinc-600/60 hover:bg-zinc-700/60",
    dotColor: "bg-zinc-500",
    headerColor: "text-zinc-400",
    badgeColor: "bg-zinc-800/60 text-zinc-500 border-zinc-700/40",
  },
];

// ── Inline label map (avoids needing new i18n plumbing for this component) ───
// Labels are kept English-only for ASO professionals — keyword strategy is a
// universal ASO concept. Arabic UI wraps the panel; the category names stay EN.
const SECTION_LABELS: Record<string, { label: string; desc: string }> = {
  competitive:    { label: "High-Volume",     desc: "Target in Title & Short Description for maximum reach" },
  competitiveDesc:{ label: "", desc: "" },
  intent:         { label: "Intent-Based",    desc: "Use in Long Description — matches what users with this problem search" },
  gap:            { label: "Competitor Gap",  desc: "Terms users search when unhappy with rival apps — your highest-conversion opportunity" },
  general:        { label: "Additional",      desc: "Supporting keywords without a specific category" },
};

// ── Keyword chip skeleton ─────────────────────────────────────────────────────
// Renders placeholder shimmer chips in the same layout as real chips.
// widths array gives natural-looking variation rather than uniform bars.
const SKELETON_WIDTHS = [72, 96, 80, 112, 64, 88, 104, 76, 92, 68, 100, 84];

function KeywordChipSkeleton() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SKELETON_WIDTHS.map((w, i) => (
        <span
          key={i}
          className="inline-block h-[28px] animate-pulse rounded-lg bg-white/[0.06]"
          style={{ width: w }}
          aria-hidden
        />
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  keywords: string[];
  copyLabel?: string;
  onCopyAll?: () => void | Promise<void>;
  /** When true the panel title is right-aligned. */
  isRtl?: boolean;
  /** When true, show shimmer skeleton instead of chip content (e.g. regenerating). */
  busy?: boolean;
};

export function KeywordStrategyPanel({ keywords, copyLabel = "Copy all", onCopyAll, isRtl = false, busy = false }: Props) {
  const [copied, setCopied] = useState(false);
  const buckets = useMemo(() => categoriseKeywords(keywords), [keywords]);

  const hasCategorised =
    buckets.competitive.length > 0 ||
    buckets.intent.length > 0 ||
    buckets.gap.length > 0;

  // Determine which sections to show (skip empty general if categorised data exists)
  const visibleSections = SECTIONS.filter((s) => {
    if (s.category === "general" && hasCategorised && buckets.general.length === 0) return false;
    return buckets[s.category].length > 0;
  });

  // Total keyword count for header badge
  const total = keywords.length;

  async function handleCopyAll() {
    if (onCopyAll) await onCopyAll();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-white/[0.045] p-6 shadow-[0_10px_36px_-18px_rgba(0,0,0,0.45)] ring-1 ring-emerald-500/10 backdrop-blur-[12px] transition-[border-color,box-shadow] duration-200 hover:border-emerald-500/20 hover:shadow-[0_14px_40px_-16px_rgba(34,197,94,0.12)]">

      {/* Header */}
      <div className={cn("mb-5 flex flex-wrap items-center justify-between gap-2", isRtl && "flex-row-reverse")}>
        <div className={cn("flex items-center gap-2.5", isRtl && "flex-row-reverse")}>
          <h3 className="text-[15px] font-semibold tracking-tight text-white/95">
            Keyword Strategy
          </h3>
          {hasCategorised && (
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              v6 · {total} keywords
            </span>
          )}
        </div>
        {onCopyAll && (
          <button
            type="button"
            onClick={handleCopyAll}
            className="inline-flex min-w-[4.5rem] items-center justify-center rounded-lg border border-white/14 bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/85 transition hover:border-emerald-500/35 hover:bg-emerald-500/10 hover:text-emerald-100"
          >
            {copied ? "✓" : copyLabel}
          </button>
        )}
      </div>

      {/* Categorised sections — shimmer skeleton while busy */}
      {busy ? (
        <div className="space-y-5">
          {/* Show one skeleton row per expected section (3 rows matches typical v9 output) */}
          {[0, 1, 2].map((i) => (
            <div key={i}>
              {/* Section header skeleton */}
              <div className="mb-2.5 flex items-center gap-2">
                <span className="inline-block h-[22px] w-24 animate-pulse rounded-full bg-white/[0.07]" aria-hidden />
                <span className="inline-block h-3 w-40 animate-pulse rounded bg-white/[0.04]" aria-hidden />
              </div>
              <KeywordChipSkeleton />
            </div>
          ))}
        </div>
      ) : hasCategorised ? (
        <div className="space-y-5">
          {visibleSections.map((section) => {
            const items = buckets[section.category];
            if (items.length === 0) return null;
            const meta = SECTION_LABELS[section.category];
            return (
              <div
                key={section.category}
                className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"
              >
                {/* Section header */}
                <div className={cn("mb-2.5 flex items-center gap-2", isRtl && "flex-row-reverse")}>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", section.badgeColor)}>
                    <span className={cn("size-1.5 rounded-full shrink-0", section.dotColor)} aria-hidden />
                    {meta.label}
                    <span className="font-normal opacity-70">· {items.length}</span>
                  </span>
                  <span className="text-[11px] leading-relaxed text-zinc-500">{meta.desc}</span>
                </div>

                {/* Keyword chips */}
                <div className="flex flex-wrap gap-1.5">
                  {items.map((kw, i) => (
                    <span
                      key={`${section.category}-${i}`}
                      className={cn(
                        "inline-flex cursor-default items-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                        section.chipColor,
                      )}
                    >
                      {kw.keyword}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Fallback: flat list for v5 or uncategorised output
        <ul className="list-disc space-y-2 ps-5 text-sm leading-relaxed text-white/82">
          {keywords.map((item, i) => (
            <li key={`${i}-${item}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
