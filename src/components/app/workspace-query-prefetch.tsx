"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useEffect } from "react";
import { prefetchListingOptimizerQueries } from "@/lib/client/prefetch-listing-optimizer";

type WorkspaceQueryPrefetchProps = {
  workspaceId: string;
};

/** Warms Listing Optimizer caches on workspace mount (SWR). */
export function WorkspaceQueryPrefetch({ workspaceId }: WorkspaceQueryPrefetchProps) {
  const queryClient = useQueryClient();
  const locale = useLocale();
  const vaultLocale = locale === "ar" ? "ar" : "en";

  useEffect(() => {
    if (!workspaceId) return;
    prefetchListingOptimizerQueries(queryClient, { workspaceId, vaultLocale });
  }, [workspaceId, vaultLocale, queryClient]);

  return null;
}
