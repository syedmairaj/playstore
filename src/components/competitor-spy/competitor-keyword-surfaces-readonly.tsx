"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  keywords: string[];
  isRtl?: boolean;
};

/**
 * Read-only keyword surfaces for Competitor Spy snapshot.
 * Strength staging is handled exclusively via the Audit Queue workflow.
 */
export function CompetitorKeywordSurfacesReadonly({ keywords, isRtl = false }: Props) {
  const t = useTranslations("competitorSpy.strengthAudit");
  const [expanded, setExpanded] = useState(false);
  const terms = useMemo(() => {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const kw of keywords) {
      const term = kw?.trim();
      if (!term) continue;
      const dedupeKey = term.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      unique.push(term);
    }
    return unique;
  }, [keywords]);

  return (
    <div className="space-y-2" dir={isRtl ? "rtl" : "ltr"}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200",
          isRtl && "flex-row-reverse font-arabic",
        )}
        aria-expanded={expanded}
      >
        <span>{t("readonlyKeywordCount", { count: terms.length })}</span>
        <ChevronDown
          className={cn("size-4 transition-transform", expanded && "rotate-180")}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className={cn("flex flex-wrap gap-1.5", isRtl && "justify-end")}>
          {terms.map((term, index) => (
            <span
              key={`${term.toLowerCase()}-${index}`}
              className="rounded-full border border-zinc-700/60 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-300"
            >
              {term}
            </span>
          ))}
        </div>
      ) : null}

      <p
        className={cn(
          "flex items-start gap-1.5 text-[11px] leading-relaxed text-zinc-500",
          isRtl && "flex-row-reverse text-end font-arabic",
        )}
      >
        <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
        {t("readonlyHint")}
      </p>
    </div>
  );
}
