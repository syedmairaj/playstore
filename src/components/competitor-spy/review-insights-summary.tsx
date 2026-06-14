"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type ReviewInsightsSummaryProps = {
  praiseTerms: string[];
  bugTerms: string[];
  requestTerms: string[];
  isRtl?: boolean;
};

export function ReviewInsightsSummary({
  praiseTerms,
  bugTerms,
  requestTerms,
  isRtl = false,
}: ReviewInsightsSummaryProps) {
  const t = useTranslations("competitorSpy.reviewInsights");
  const [expanded, setExpanded] = useState(false);

  const parts: string[] = [];
  if (praiseTerms.length > 0) {
    parts.push(t("summaryPraise", { count: praiseTerms.length }));
  }
  if (bugTerms.length > 0) {
    parts.push(t("summaryBugs", { count: bugTerms.length }));
  }
  if (requestTerms.length > 0) {
    parts.push(t("summaryRequests", { count: requestTerms.length }));
  }

  if (parts.length === 0) {
    return (
      <p className={cn("text-xs text-zinc-500", isRtl && "text-end font-arabic")}>
        {t("summaryEmpty")}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#070a0f] p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-3 text-start",
          isRtl && "flex-row-reverse text-end font-arabic",
        )}
        aria-expanded={expanded}
      >
        <span className="text-sm font-medium text-zinc-200">{parts.join(" · ")}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-zinc-500 transition-transform",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {praiseTerms.length > 0 ? (
            <InsightBucket
              title={t("bucketPraiseTitle")}
              terms={praiseTerms}
              tone="emerald"
              isRtl={isRtl}
            />
          ) : null}
          {bugTerms.length > 0 ? (
            <InsightBucket
              title={t("bucketBugsTitle")}
              terms={bugTerms}
              tone="rose"
              isRtl={isRtl}
            />
          ) : null}
          {requestTerms.length > 0 ? (
            <InsightBucket
              title={t("bucketRequestsTitle")}
              terms={requestTerms}
              tone="indigo"
              isRtl={isRtl}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function InsightBucket({
  title,
  terms,
  tone,
  isRtl,
}: {
  title: string;
  terms: string[];
  tone: "emerald" | "rose" | "indigo";
  isRtl?: boolean;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200"
      : tone === "rose"
        ? "border-rose-500/20 bg-rose-500/[0.06] text-rose-200"
        : "border-indigo-500/20 bg-indigo-500/[0.06] text-indigo-200";

  return (
    <div className={cn("rounded-lg border p-3", toneClass)}>
      <p className={cn("mb-2 text-xs font-semibold", isRtl && "text-end")}>{title}</p>
      <div className={cn("flex flex-wrap gap-1.5", isRtl && "justify-end")}>
        {terms.map((term, i) => (
          <span
            key={`${title}-${i}-${term}`}
            className="rounded-full bg-black/20 px-2 py-0.5 text-[11px] font-medium"
          >
            {term}
          </span>
        ))}
      </div>
    </div>
  );
}
