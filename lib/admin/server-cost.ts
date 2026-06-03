import "server-only";


/** Monthly infra budget (USD); prorated over chart windows in the admin dashboard. */
export function getMonthlyServerCostUsd(): number {
  const raw = process.env.MONTHLY_SERVER_COST_USD;
  if (raw === undefined || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function serverCostForChartDays(dayCount: number): number {
  const monthly = getMonthlyServerCostUsd();
  if (!Number.isFinite(dayCount) || dayCount <= 0) return 0;
  return (monthly / 30) * dayCount;
}
