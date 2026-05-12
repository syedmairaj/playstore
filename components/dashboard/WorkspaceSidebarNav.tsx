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
  onItemClick,
}: {
  items: NavItem[];
  navAriaLabel: string;
  onItemClick?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-col gap-0.5 px-3"
      aria-label={navAriaLabel}
    >
      {items.map((item) => {
        const active = pathMatches(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onItemClick}
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
