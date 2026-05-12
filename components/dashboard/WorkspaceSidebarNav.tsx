"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

function pathMatches(pathname: string | null, href: string) {
  if (!pathname) return false;
  const normalized = pathname.replace(/^\/(en|ar)(?=\/)/, "");
  return normalized === href || normalized.startsWith(`${href}/`);
}

export function WorkspaceSidebarNav({
  items,
  navAriaLabel,
}: {
  items: NavItem[];
  navAriaLabel: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      className="flex gap-1 overflow-x-auto px-2 pb-4 md:flex-col md:px-3 md:pb-6"
      aria-label={navAriaLabel}
    >
      {items.map((item) => {
        const active = pathMatches(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-[#22C55E]/15 font-medium text-[#22C55E] ring-1 ring-[#22C55E]/25"
                : "text-white/55 hover:bg-white/[0.06] hover:text-white",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
