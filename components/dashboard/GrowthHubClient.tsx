"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,260px)_1fr] lg:items-start">
      <aside className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#22C55E]/90">
          {t("suiteTitle")}
        </p>
        <p className="mt-2 text-sm text-white/50">{t("suiteHint")}</p>
        <div className="mt-6 flex flex-col gap-2" aria-label={t("suiteTitle")}>
          {SUITE_ACTIONS.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => go(row.id)}
              className={cn(
                "rounded-xl px-4 py-3 text-left transition-all",
                "border border-transparent bg-white/[0.02] hover:border-white/[0.08] hover:bg-white/[0.06]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22C55E]/50",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white">{t(row.labelKey)}</span>
                <span className="text-white/35" aria-hidden>
                  →
                </span>
              </span>
              <span className="mt-1 block text-[11px] leading-snug text-white/38">
                {t(row.hintKey)}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-8 text-xs leading-relaxed text-white/35">{t("phoneCaption")}</p>
        <p className="mt-2 font-mono text-[10px] text-white/25">#{workspaceId.slice(0, 8)}…</p>
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
        />
      </div>
    </div>
  );
}
