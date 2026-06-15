"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useCallback, useMemo } from "react";
import { prefetchListingOptimizerQueries } from "@/lib/client/prefetch-listing-optimizer";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

function pathMatches(pathname: string | null, href: string) {
  if (!pathname) return false;
  const normalized = pathname.replace(/^\/(en|ar)(?=\/)/, "");
  return normalized === href || normalized.startsWith(`${href}/`);
}

function isListingOptimizerHref(href: string): boolean {
  return href.includes("/listing-optimizer");
}

function isMarketIntelHref(href: string): boolean {
  return href.endsWith("/market") || href.includes("/market/");
}

export function WorkspaceSidebarNav({
  items,
  navAriaLabel,
  onItemClick,
  workspaceId,
}: {
  items: NavItem[];
  navAriaLabel: string;
  onItemClick?: () => void;
  workspaceId: string;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const vaultLocale = locale === "ar" ? "ar" : "en";

  const listingOptimizerHref = useMemo(
    () => items.find((item) => isListingOptimizerHref(item.href))?.href,
    [items],
  );
  const onListingOptimizer =
    listingOptimizerHref != null && pathMatches(pathname, listingOptimizerHref);

  const prefetchListingOptimizer = useCallback(() => {
    if (!workspaceId) return;
    prefetchListingOptimizerQueries(queryClient, { workspaceId, vaultLocale });
  }, [queryClient, workspaceId, vaultLocale]);

  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label={navAriaLabel}>
      {items.map((item) => {
        const isMarketIntel = isMarketIntelHref(item.href);
        const isOptimizer = isListingOptimizerHref(item.href);

        const active = isMarketIntel
          ? pathMatches(pathname, item.href) || onListingOptimizer
          : isOptimizer
            ? onListingOptimizer
            : pathMatches(pathname, item.href);

        const prefetchOnHover = isOptimizer;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onItemClick}
            onMouseEnter={prefetchOnHover ? prefetchListingOptimizer : undefined}
            onFocus={prefetchOnHover ? prefetchListingOptimizer : undefined}
            className={cn(
              "rounded-lg px-3 py-2.5 text-sm transition-[color,background-color,box-shadow] duration-150",
              active
                ? "bg-[#22C55E]/14 font-medium text-[#86efac] shadow-[inset_0_1px_0_0_rgba(34,197,94,0.12)] ring-1 ring-[#22C55E]/28"
                : "text-white/55 hover:bg-white/[0.06] hover:text-white/90 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
