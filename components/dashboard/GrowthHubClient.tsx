"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { LivePreviewPhone } from "@/components/features/visualizer/live-preview-phone";
import type { PreviewMode } from "@/components/features/visualizer/live-preview-phone";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { cn } from "@/lib/utils";

type SuiteId = "aso" | "ads" | "push";

const SUITE_ACTIONS: {
  id: SuiteId;
  labelKey: "aso" | "ads" | "push";
  hintKey: "suiteHints.aso" | "suiteHints.ads" | "suiteHints.push";
}[] = [
  { id: "aso", labelKey: "aso", hintKey: "suiteHints.aso" },
  { id: "ads", labelKey: "ads", hintKey: "suiteHints.ads" },
  { id: "push", labelKey: "push", hintKey: "suiteHints.push" },
];

type Props = {
  workspaceId: string;
  appName: string;
  category: string;
  keywords: string;
  previewResult: ListingGenerationOutput | null;
  listingOptimizerEnabled: boolean;
};

export function GrowthHubClient({
  workspaceId,
  appName,
  category,
  keywords,
  previewResult,
  listingOptimizerEnabled,
}: Props) {
  const t = useTranslations("dashboard.growthHub");
  const locale = useLocale();
  const previewDir = locale === "ar" ? "rtl" : "ltr";
  const router = useRouter();
  const [phonePreviewMode, setPhonePreviewMode] = useState<PreviewMode>("aso");

  function go(id: SuiteId) {
    const base = `/app/${workspaceId}`;
    if (id === "aso") {
      if (listingOptimizerEnabled) {
        router.push(`${base}/listing-optimizer`);
      } else {
        router.push(base);
      }
      return;
    }
    if (id === "ads") {
      router.push(`${base}/growth/ads`);
      return;
    }
    router.push(`${base}/growth/push`);
  }

  const contextEyebrow = t(`phoneContext.${phonePreviewMode}`);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,280px)_1fr] lg:items-start">
      <aside
        className={cn(
          "relative overflow-hidden rounded-2xl border border-[#22C55E]/28 bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02]",
          "p-6 shadow-[0_0_0_1px_rgba(34,197,94,0.28),0_28px_72px_-28px_rgba(0,0,0,0.68),0_0_72px_-28px_rgba(34,197,94,0.2)] backdrop-blur-md sm:p-7",
          "ring-1 ring-[#22C55E]/35 ring-inset",
        )}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#22C55E] sm:text-xs">
          {t("suiteTitle")}
        </p>
        <p className="mt-3 text-[15px] font-semibold leading-snug text-white/90 sm:text-base">
          {t("suiteHint")}
        </p>
        <div className="mt-7 flex flex-col gap-3" aria-label={t("suiteTitle")}>
          {SUITE_ACTIONS.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => go(row.id)}
              className={cn(
                "group flex min-h-[7.5rem] w-full flex-col rounded-2xl border px-5 py-5 text-start transition-all sm:min-h-[7.75rem]",
                "border-white/[0.1] bg-white/[0.035] hover:border-[#22C55E]/45 hover:bg-[#22C55E]/[0.08] hover:shadow-[0_14px_40px_-20px_rgba(34,197,94,0.22)]",
                "active:scale-[0.99] active:border-[#22C55E]/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0e14]",
              )}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="text-[15px] font-semibold tracking-tight text-white">
                  {t(row.labelKey)}
                </span>
                <ChevronRight
                  className="mt-0.5 size-4 shrink-0 text-white/40 transition group-hover:text-[#86efac]/90 rtl:rotate-180"
                  aria-hidden
                />
              </span>
              <span className="mt-2 block flex-1 text-[12px] leading-snug text-white/42 group-hover:text-white/55">
                {t(row.hintKey)}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-9 text-xs leading-relaxed text-white/38">{t("phoneCaption")}</p>
      </aside>

      <div className="flex min-w-0 flex-col items-center justify-start gap-4 lg:items-end">
        <LivePreviewPhone
          appName={appName}
          category={category}
          keywords={keywords}
          result={previewResult}
          loading={false}
          typingEnabled={false}
          mode={phonePreviewMode}
          onModeChange={setPhonePreviewMode}
          contextEyebrow={contextEyebrow}
          pulseScanOnModeChange
          previewDir={previewDir}
        />
      </div>
    </div>
  );
}
