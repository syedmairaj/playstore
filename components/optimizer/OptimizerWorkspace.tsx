"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  fetchUnutilizedListingImprovements,
  type ListingImprovementItem,
} from "@/components/reviews/review-improvements-queue";
import { ActiveOptimizationQueuePanel } from "@/components/optimizer/ActiveOptimizationQueuePanel";
import { cn } from "@/lib/utils";

export type OptimizerWorkspaceProps = {
  workspaceId: string;
  className?: string;
  children?: ReactNode;
};

export function OptimizerWorkspace({ workspaceId, className, children }: OptimizerWorkspaceProps) {
  const [items, setItems] = useState<ListingImprovementItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchUnutilizedListingImprovements(workspaceId).then((rows) => {
      if (!cancelled) {
        setItems(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <ActiveOptimizationQueuePanel items={items} loading={loading} />
      {children}
    </div>
  );
}
