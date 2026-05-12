"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LivePreviewPhone } from "@/components/features/visualizer/live-preview-phone";
import type { PreviewMode } from "@/components/features/visualizer/live-preview-phone";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import { cn } from "@/lib/utils";

const SUITE: { id: PreviewMode; labelKey: "aso" | "ads" | "push" }[] = [
  { id: "aso", labelKey: "aso" },
  { id: "ad", labelKey: "ads" },
  { id: "push", labelKey: "push" },
];

type Props = {
  workspaceId: string;
  appName: string;
  category: string;
  keywords: string;
  previewResult: ListingGenerationOutput | null;
};

export function GrowthHubClient({
  workspaceId,
  appName,
  category,
  keywords,
  previewResult,
}: Props) {
  const t = useTranslations("dashboard.growthHub");
  const [suite, setSuite] = useState<PreviewMode>("aso");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,260px)_1fr] lg:items-start">
      <aside className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#22C55E]/90">
          {t("suiteTitle")}
        </p>
        <p className="mt-2 text-sm text-white/50">{t("suiteHint")}</p>
        <div className="mt-6 flex flex-col gap-2" role="tablist" aria-label={t("suiteTitle")}>
          {SUITE.map((row) => {
            const active = suite === row.id;
            return (
              <button
                key={row.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSuite(row.id)}
                className={cn(
                  "rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all",
                  active
                    ? "bg-[#22C55E]/15 text-white ring-1 ring-[#22C55E]/35"
                    : "text-white/55 hover:bg-white/[0.05] hover:text-white",
                )}
              >
                {t(row.labelKey)}
              </button>
            );
          })}
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
          mode={suite}
          onModeChange={setSuite}
        />
      </div>
    </div>
  );
}
