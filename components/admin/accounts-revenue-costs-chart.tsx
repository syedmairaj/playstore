"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type AccountsChartRow = {
  dateLabel: string;
  revenueUsd: number;
  costsUsd: number;
};

type Props = {
  data: AccountsChartRow[];
  revenueLabel: string;
  costsLabel: string;
};

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function AccountsRevenueCostsChart({
  data,
  revenueLabel,
  costsLabel,
}: Props) {
  return (
    <div className="h-80 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="dateLabel"
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            stroke="#475569"
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            stroke="#475569"
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "8px",
              color: "#f1f5f9",
            }}
            formatter={(value, name) => {
              const n =
                typeof value === "number"
                  ? value
                  : typeof value === "string"
                    ? Number(value)
                    : 0;
              return [fmtUsd(Number.isFinite(n) ? n : 0), String(name)];
            }}
          />
          <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
          <Bar dataKey="revenueUsd" name={revenueLabel} fill="#22c55e" radius={[2, 2, 0, 0]} />
          <Bar dataKey="costsUsd" name={costsLabel} fill="#f97316" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
