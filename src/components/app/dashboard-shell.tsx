"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DashboardNavbar } from "@/components/app/dashboard-navbar";
import { DashboardSidebar } from "@/components/app/dashboard-sidebar";
import { WorkspaceAppProviders } from "@/components/app/workspace-app-providers";
import { WorkspaceQueryPrefetch } from "@/components/app/workspace-query-prefetch";
import type { NavItem } from "@/components/dashboard/WorkspaceSidebarNav";
import { cn } from "@/lib/utils";

export function DashboardShell({
  children,
  workspaceId,
  workspaceName,
  workspacePlan,
  workspaces,
  creditsRemaining,
  creditsAllocation,
  hubLabel,
  navItems,
  navAriaLabel,
  userEmail,
}: {
  children: React.ReactNode;
  workspaceId: string;
  workspaceName: string;
  /** Normalized billing plan (`free` | `pro` | `growth`). */
  workspacePlan: string;
  workspaces: { id: string; name: string }[];
  creditsRemaining: number;
  creditsAllocation: number;
  hubLabel: string;
  navItems: NavItem[];
  navAriaLabel: string;
  userEmail: string | null;
}) {
  const t = useTranslations("dashboard.shell");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  return (
    <WorkspaceAppProviders>
      <WorkspaceQueryPrefetch workspaceId={workspaceId} />
      <div className="flex h-full min-h-0 w-full overflow-x-hidden bg-[#090c11] text-zinc-100 antialiased">
        {mobileNavOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] md:hidden"
            aria-label={t("closeMenu")}
            onClick={() => setMobileNavOpen(false)}
          />
        ) : null}

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-e border-white/[0.06] bg-[#070a0f] shadow-2xl shadow-black/50 transition-transform duration-200 ease-out md:max-w-none md:shadow-[4px_0_24px_-8px_rgba(0,0,0,0.35)]",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
            !mobileNavOpen && "pointer-events-none md:pointer-events-auto",
          )}
        >
          <DashboardSidebar
            items={navItems}
            navAriaLabel={navAriaLabel}
            onNavigate={() => setMobileNavOpen(false)}
            workspaceId={workspaceId}
            className="h-full"
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:ml-[280px]">
          <DashboardNavbar
            workspaceId={workspaceId}
            workspaceName={workspaceName}
            workspacePlan={workspacePlan}
            workspaces={workspaces}
            creditsRemaining={creditsRemaining}
            creditsAllocation={creditsAllocation}
            hubLabel={hubLabel}
            userEmail={userEmail}
            onOpenMobileNav={() => setMobileNavOpen(true)}
          />
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <div className="mx-auto min-h-0 w-full max-w-[1600px] px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
              {children}
            </div>
          </main>
        </div>
      </div>
    </WorkspaceAppProviders>
  );
}
