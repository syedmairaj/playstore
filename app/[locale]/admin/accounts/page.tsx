import { Link } from "@/i18n/navigation";
import LinkNext from "next/link";
import { AccountsRevenueCostsChart } from "@/components/admin/accounts-revenue-costs-chart";
import {
  chartRowsFromDaily,
  computeFinancialHealth,
  estimateWorkspaceSystemCostUsd,
  fetchAdminFinancialSnapshot,
} from "@/lib/admin/financials";
import { serverCostForChartDays } from "@/lib/admin/server-cost";
import { getTranslations } from "next-intl/server";

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default async function AdminAccountsPage() {
  const t = await getTranslations("admin.accounts");
  const res = await fetchAdminFinancialSnapshot();
  if (!res.ok) {
    const isForbiddenLike =
      res.code === "forbidden" || res.code === "PGRST116";
    const isNoAuthUid = res.code === "no_auth_uid";
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-16 text-slate-100">
        <h1 className="text-xl font-semibold text-white">{t("loadErrorTitle")}</h1>
        {isNoAuthUid ? (
          <p className="text-sm leading-relaxed text-slate-400">
            {t("noAuthUidMessage")}
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-slate-400">
            {t("loadError", { code: res.code })}
          </p>
        )}
        {isForbiddenLike ? (
          <div className="rounded-lg border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-100/90">
            <p className="font-medium text-amber-50">
              {t("forbiddenPrivilegeMessage")}
            </p>
            <p className="mt-3 font-medium text-amber-50/95">
              {t("forbiddenSetupTitle")}
            </p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-amber-100/85">
              <li>{t("forbiddenBulletMigrations")}</li>
              <li>
                <span className="block font-mono text-xs text-amber-200/90">
                  {t("forbiddenSqlSnippet")}
                </span>
              </li>
              <li>{t("forbiddenBulletAuthUid")}</li>
              <li>{t("forbiddenBulletGrantExecute")}</li>
            </ul>
            <p className="mt-3 text-xs text-amber-200/80">
              {t("forbiddenDocRef")}{" "}
              <code className="rounded bg-black/30 px-1.5 py-0.5 text-amber-100/90">
                docs/admin-financial-setup.md
              </code>
            </p>
          </div>
        ) : isNoAuthUid ? null : (
          <p className="text-xs text-slate-500">{t("loadErrorHint")}</p>
        )}
        <Link
          href="/app"
          className="inline-flex text-sm text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
        >
          {t("backToApp")}
        </Link>
      </div>
    );
  }
  const { data } = res;
  const dayCount = data.daily_series.length;
  const serverPeriod = serverCostForChartDays(dayCount);
  const health = computeFinancialHealth({
    daily_series: data.daily_series,
    grossRevenueUsd: 0,
    hasPaymentsData: data.totals.has_payments_table,
    serverCostForPeriodUsd: serverPeriod,
  });
  const chartData = chartRowsFromDaily(data.daily_series);
  const netPositive = health.netProfitUsd >= 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 text-slate-100">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          {t("title")}
        </h1>
        <p className="max-w-2xl text-sm text-slate-400">{t("subtitle")}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-black/20">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("netProfit")}
          </p>
          <p
            className={`mt-2 text-3xl font-bold tabular-nums ${
              netPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {fmtUsd(health.netProfitUsd)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{health.periodLabel}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("margin")}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-100">
            {health.marginPercent === null ? t("marginEmpty") : `${health.marginPercent.toFixed(1)}%`}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("gross")}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">
            {fmtUsd(health.grossRevenueUsd)}
          </p>
          {!health.hasPaymentsData ? (
            <p className="mt-2 text-xs text-amber-200/90">{t("paymentsGap")}</p>
          ) : null}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("aiCosts")}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-orange-300">
            {fmtUsd(health.aiCostsEstimatedUsd)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t("stripe")}: {fmtUsd(health.stripeFeesUsd)} · {t("server")}:{" "}
            {fmtUsd(health.serverCostUsd)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-medium text-white">{t("chartTitle")}</h2>
        <div className="mt-4">
          <AccountsRevenueCostsChart
            data={chartData}
            revenueLabel={t("chartRevenue")}
            costsLabel={t("chartCosts")}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <LinkNext
          className="inline-flex items-center rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          href="/api/admin/financial-export?format=csv"
          prefetch={false}
        >
          {t("exportCsv")}
        </LinkNext>
        <LinkNext
          className="inline-flex items-center rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          href="/api/admin/financial-export?format=json"
          prefetch={false}
        >
          {t("exportJson")}
        </LinkNext>
        <Link
          href="/app"
          className="inline-flex items-center rounded-lg border border-transparent px-4 py-2 text-sm text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
        >
          {t("backToApp")}
        </Link>
      </div>

      <p className="text-xs text-slate-500">{t("creditsNote")}</p>
      <p className="text-xs text-slate-600">
        All-time: purchased {data.totals.credits_purchased_all_time} credits · spent{" "}
        {data.totals.credits_spent_all_time} credits · workspaces{" "}
        {data.totals.workspace_count} · listing generations{" "}
        {data.totals.listing_generations_all_time}
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-inner">
        <h2 className="border-b border-slate-800 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-slate-200">
          {t("tableTitle")}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">{t("colWorkspace")}</th>
                <th className="px-4 py-3 font-medium">{t("colOwner")}</th>
                <th className="px-4 py-3 font-medium">{t("colPlan")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("colCredits")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("colSpent")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("colEstCost")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.workspaces.map((w) => (
                <tr key={w.id} className="hover:bg-slate-900/50">
                  <td className="px-4 py-3 font-medium text-slate-100">{w.name}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {w.owner_display_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-300">{w.plan}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                    {w.ai_credits_remaining}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                    {w.credits_spent_total}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-200/90">
                    ~{fmtUsd(estimateWorkspaceSystemCostUsd(w))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
