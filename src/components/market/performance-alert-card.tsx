"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { PerformanceAlert } from "@/lib/market/rank-tracking.types";

type Props = {
  alerts: PerformanceAlert[];
  optimizerHref: string;
  isRtl?: boolean;
};

export function PerformanceAlertCard({
  alerts,
  optimizerHref,
  isRtl = false,
}: Props) {
  const t = useTranslations("market.wins.alerts");

  if (alerts.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.keywordId}
          className={cn(
            "flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3.5",
            isRtl && "flex-row-reverse text-end",
          )}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/12">
            <AlertTriangle className="size-4 text-red-300" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-300/90">
              {t("title")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-red-100/90">
              {t.rich("message", {
                term: (chunks) => (
                  <strong className="font-semibold text-red-50">{chunks}</strong>
                ),
                optimizer: (chunks) => (
                  <Link
                    href={optimizerHref}
                    className="font-medium text-red-200 underline-offset-2 hover:underline"
                  >
                    {chunks}
                  </Link>
                ),
                keyword: alert.term,
                positions: alert.positionsDropped,
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
