"use client";

import { type ReactNode } from "react";
import { useLocale } from "next-intl";
import { ActiveOptimizationQueuePanel } from "@/components/optimizer/ActiveOptimizationQueuePanel";
import { useOptimizationQueue } from "@/hooks/useOptimizationQueue";
import { optimizationQueueItemsToImprovements } from "@/lib/client/optimization-queue-improvements";
import { cn } from "@/lib/utils";
import type { ListingImprovementItem } from "@/components/reviews/review-improvements-queue";

export type OptimizerWorkspaceProps = {
  workspaceId: string;
  appId?: string;
  ownPackageName?: string | null;
  className?: string;
  children?: ReactNode;
};

function queueItemsToImprovements(
  items: ReturnType<typeof useOptimizationQueue>["items"],
): ListingImprovementItem[] {
  return optimizationQueueItemsToImprovements(items);
}

export function OptimizerWorkspace({
  workspaceId,
  appId,
  ownPackageName,
  className,
  children,
}: OptimizerWorkspaceProps) {
  const locale = useLocale();
  const vaultLocale = locale === "ar" ? "ar" : "en";
  const { items, isLoading, removeItem } = useOptimizationQueue(
    workspaceId,
    vaultLocale,
    appId,
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <ActiveOptimizationQueuePanel
        items={queueItemsToImprovements(items)}
        loading={isLoading}
        ownPackageName={ownPackageName}
        onRemoveItem={(id) => void removeItem(id)}
      />
      {children}
    </div>
  );
}
