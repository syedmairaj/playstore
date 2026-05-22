"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type LeaderboardRow = {
  featureSlug: string;
  featureLabel: string;
  totalRuns: number;
  totalCredits: number;
  geminiUsd: number;
  serperUsd: number;
  totalRawCogsUsd: number;
};

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(n);
}

function fmtUsdShort(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

export function FeatureLeaderboardPanel() {
  const t = useTranslations("admin.analytics");
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/ai-analytics/feature-leaderboard");
        const data = (await res.json()) as
          | { ok: true; rows: LeaderboardRow[] }
          | { ok: false; error?: { message?: string } };
        if (cancelled) return;
        if (!data.ok) {
          setError(data.error?.message ?? t("loadError"));
          return;
        }
        setRows(data.rows);
      } catch {
        if (!cancelled) setError(t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const totalCogs = rows.reduce((s, r) => s + r.totalRawCogsUsd, 0);
  const totalRuns = rows.reduce((s, r) => s + r.totalRuns, 0);
  const totalCredits = rows.reduce((s, r) => s + r.totalCredits, 0);
  const totalGemini = rows.reduce((s, r) => s + r.geminiUsd, 0);
  const totalSerper = rows.reduce((s, r) => s + r.serperUsd, 0);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {t("featureLeaderboardTitle")}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {t("featureLeaderboardSubtitle")}
          </p>
        </div>
        {!loading && !error && rows.length > 0 && (
          <div className="shrink-0 rounded-lg border border-slate-700/60 bg-slate-800/50 px-3 py-1.5 text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              Total COGS
            </p>
            <p className="font-mono text-sm font-bold text-orange-300">
              {fmtUsdShort(totalCogs)}
            </p>
          </div>
        )}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">{t("loading")}</p>
      ) : error ? (
        <p className="mt-6 text-sm text-rose-300">{error}</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{t("empty")}</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] uppercase tracking-widest text-slate-500">
                <th className="pb-2 pe-3 font-medium">{t("colFeature")}</th>
                <th className="pb-2 px-2 font-medium text-right">{t("colRuns")}</th>
                <th className="pb-2 px-2 font-medium text-right">{t("colCredits")}</th>
                <th className="pb-2 px-2 font-medium text-right">{t("colCostSplit")}</th>
                <th className="pb-2 ps-3 font-medium text-right">{t("colTotalCogs")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {rows.map((row, i) => (
                <tr key={row.featureSlug} className="group hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 pe-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-800 font-mono text-[10px] font-bold text-slate-400">
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-medium text-slate-100">{row.featureLabel}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-slate-600">
                          {row.featureSlug}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-slate-300">
                    {row.totalRuns.toLocaleString()}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-slate-300">
                    {row.totalCredits.toLocaleString()}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <div className="space-y-0.5 text-xs">
                      <p className="text-violet-300">
                        {t("costSplitGemini", { usd: fmtUsd(row.geminiUsd) })}
                      </p>
                      <p className="text-sky-300">
                        {t("costSplitSerper", { usd: fmtUsd(row.serperUsd) })}
                      </p>
                    </div>
                  </td>
                  <td className="ps-3 py-3 text-right">
                    <span className="inline-block rounded-md bg-orange-500/10 px-2 py-0.5 font-mono text-sm font-semibold text-orange-300 ring-1 ring-orange-500/20">
                      {fmtUsdShort(row.totalRawCogsUsd)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-700">
                <td className="py-2.5 pe-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Totals
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-xs font-semibold text-slate-400">
                  {totalRuns.toLocaleString()}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-xs font-semibold text-slate-400">
                  {totalCredits.toLocaleString()}
                </td>
                <td className="px-2 py-2.5 text-right">
                  <div className="space-y-0.5 text-xs font-semibold">
                    <p className="text-violet-400">{fmtUsd(totalGemini)}</p>
                    <p className="text-sky-400">{fmtUsd(totalSerper)}</p>
                  </div>
                </td>
                <td className="ps-3 py-2.5 text-right">
                  <span className="inline-block rounded-md bg-orange-500/15 px-2 py-0.5 font-mono text-sm font-bold text-orange-200 ring-1 ring-orange-500/30">
                    {fmtUsdShort(totalCogs)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
