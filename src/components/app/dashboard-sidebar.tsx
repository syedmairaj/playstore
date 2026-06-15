"use client";

import { Link } from "@/i18n/navigation";
import { PlayStoreLogo } from "@/components/marketing/PlayStoreLogo";
import { SignOutButton } from "@/components/app/SignOutButton";
import { WorkspaceSidebarNav, type NavItem } from "@/components/dashboard/WorkspaceSidebarNav";
import { cn } from "@/lib/utils";

type Props = {
  items: NavItem[];
  navAriaLabel: string;
  onNavigate?: () => void;
  className?: string;
  workspaceId: string;
};

export function DashboardSidebar({
  items,
  navAriaLabel,
  onNavigate,
  className,
  workspaceId,
}: Props) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-[280px] shrink-0 flex-col bg-[#070a0f]",
        className,
      )}
    >
      <div className="shrink-0 border-b border-white/[0.07] px-4 py-5 shadow-[0_12px_32px_-24px_rgba(0,0,0,0.65)]">
        <Link
          href="/"
          onClick={onNavigate}
          className="inline-flex rounded-lg outline-none ring-offset-[#070a0f] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#22C55E]/55"
        >
          <PlayStoreLogo size="sm" brand="play" />
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-3">
        <WorkspaceSidebarNav
          items={items}
          navAriaLabel={navAriaLabel}
          onItemClick={onNavigate}
          workspaceId={workspaceId}
        />
      </div>

      <div className="shrink-0 border-t border-white/[0.07] bg-[#060910]/90 p-4 backdrop-blur-sm">
        <SignOutButton className="w-full justify-center rounded-xl py-2.5 text-sm font-medium" />
      </div>
    </div>
  );
}
