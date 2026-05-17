"use client";

import { OptimizerShimmerBar } from "@/components/listing/optimizer/optimizer-shimmer-bar";
const SKELETON_ROW_COUNT = 4;

export function KeywordWatchlistTableSkeleton({ className }: { className?: string }) {
  return (
    <tbody className={className}>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
        <tr key={i} className="border-b border-white/[0.06]">
          <td className="px-5 py-4">
            <OptimizerShimmerBar className="mb-2 h-4 w-36 max-w-full rounded-md" delayS={i * 0.04} />
            <OptimizerShimmerBar className="h-3 w-24 rounded-md opacity-70" delayS={i * 0.04 + 0.05} />
          </td>
          <td className="px-4 py-4">
            <OptimizerShimmerBar className="h-8 w-28 rounded-md" delayS={i * 0.04 + 0.08} />
          </td>
          <td className="px-4 py-4">
            <OptimizerShimmerBar className="h-4 w-10 rounded-md" delayS={i * 0.04 + 0.1} />
          </td>
          <td className="px-4 py-4">
            <OptimizerShimmerBar className="h-9 w-[120px] rounded-md" delayS={i * 0.04 + 0.12} />
          </td>
          <td className="px-4 py-4">
            <OptimizerShimmerBar className="h-4 w-16 rounded-md" delayS={i * 0.04 + 0.14} />
          </td>
          <td className="px-5 py-4">
            <div className="flex justify-end gap-2">
              <OptimizerShimmerBar className="h-8 w-24 rounded-lg" delayS={i * 0.04 + 0.16} />
              <OptimizerShimmerBar className="h-8 w-20 rounded-lg" delayS={i * 0.04 + 0.18} />
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  );
}
