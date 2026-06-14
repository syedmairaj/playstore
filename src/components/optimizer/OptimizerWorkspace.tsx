"use client";

import { type ReactNode } from "react";
import { useLocale } from "next-intl";
import { ActiveOptimizationQueuePanel } from "@/components/optimizer/ActiveOptimizationQueuePanel";
import { useOptimizationQueue } from "@/hooks/useOptimizationQueue";
import { cn } from "@/lib/utils";
import type { ListingImprovementItem } from "@/components/reviews/review-improvements-queue";

export type OptimizerWorkspaceProps = {
  workspaceId: string;
  appId?: string;
  className?: string;
  children?: ReactNode;
};

function queueItemsToImprovements(
  items: ReturnType<typeof useOptimizationQueue>["items"],
): ListingImprovementItem[] {
  return items.map((item) => ({
    id: item.id,
    reviewId: item.id,
    reviewText: item.content,
    title: item.content,
    userName: "",
    score: 0,
    sentimentTag:
      item.type === "market_keyword"
        ? item.content.startsWith("market_spotlight:")
          ? item.content
          : `market_spotlight:${item.content}`
        : item.content,
    appId: null,
    packageName: null,
    isUtilized: false,
    createdAt: item.stagedAt,
  }));
}

export function OptimizerWorkspace({
  workspaceId,
  appId,
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
        onRemoveItem={(id) => void removeItem(id)}
      />
      {children}
    </div>
  );
}
