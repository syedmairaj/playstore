"use client";

import { useState } from "react";
import { LogOut, Menu, Settings, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuthModal } from "@/components/auth/auth-modal-context";
import { CreditsBar } from "@/components/app/CreditsBar";
import { WorkspaceSwitcher } from "@/components/dashboard/WorkspaceSwitcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Props = {
  workspaceId: string;
  workspaceName: string;
  workspaces: { id: string; name: string }[];
  creditsRemaining: number;
  creditsAllocation: number;
  hubLabel: string;
  /** From server session (Supabase). If the app used Clerk, this could come from `useUser()` instead. */
  userEmail: string | null;
  onOpenMobileNav?: () => void;
};

export function DashboardNavbar({
  workspaceId,
  workspaceName,
  workspaces,
  creditsRemaining,
  creditsAllocation,
  hubLabel,
  userEmail,
  onOpenMobileNav,
}: Props) {
  const t = useTranslations("dashboard");
  const ts = useTranslations("dashboard.shell");
  const { closeAuth } = useAuthModal();
  const [signingOut, setSigningOut] = useState(false);
  const settingsHref = `/app/${workspaceId}/settings`;

  function signOut() {
    setSigningOut(true);
    closeAuth();
    window.location.assign(new URL("/auth/signout", window.location.origin).toString());
  }

  return (
    <header
      className={cn(
        "z-30 flex h-[56px] shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#090c11]/95 px-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] backdrop-blur-md sm:h-[60px] sm:gap-4 sm:px-5",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {onOpenMobileNav ? (
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white md:hidden"
            aria-label={ts("openMenu")}
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/38">{hubLabel}</p>
          <h1 className="truncate text-sm font-semibold tracking-tight text-white sm:text-base">{workspaceName}</h1>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
        <WorkspaceSwitcher currentId={workspaceId} workspaces={workspaces} variant="navbar" />
        <CreditsBar
          balance={creditsRemaining}
          monthlyAllocation={creditsAllocation}
          workspaceId={workspaceId}
          className="border-white/[0.1] bg-white/[0.05] text-white [&_.text-muted-foreground]:text-white/50"
        />
        {/*
          Radix DropdownMenu is click-activated (pointer down/up on trigger). Hover does not open the menu;
          optional hover styling on the trigger is affordance only (e.g. ring), same on desktop and mobile.
        */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.05] text-white/85 outline-none transition-colors hover:bg-white/[0.08] hover:text-white hover:ring-2 hover:ring-[#22C55E]/28 focus-visible:ring-2 focus-visible:ring-[#22C55E]/45"
              aria-label={ts("userMenu")}
            >
              <UserRound className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-[14rem] border border-white/10 bg-[#10141c] p-1 text-white shadow-xl shadow-black/40"
          >
            <div className="px-2.5 pb-2 pt-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#86efac]/80">
                {ts("accountMenuEmailLabel")}
              </p>
              <p
                className="mt-1 break-all text-sm font-semibold leading-snug tracking-tight text-white"
                title={userEmail ?? undefined}
              >
                {userEmail ?? "—"}
              </p>
            </div>
            <DropdownMenuSeparator className="bg-white/[0.08]" />
            <DropdownMenuItem asChild className="cursor-pointer rounded-lg text-sm text-white/90 focus:bg-[#22C55E]/15 focus:text-white">
              <Link href={settingsHref} className="flex items-center gap-2">
                <Settings className="h-4 w-4 shrink-0 text-[#86efac]/90" strokeWidth={1.75} aria-hidden />
                {t("settings")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/[0.08]" />
            <DropdownMenuItem
              disabled={signingOut}
              className="cursor-pointer rounded-lg text-sm text-white/90 focus:bg-[#22C55E]/15 focus:text-white"
              onSelect={() => {
                signOut();
              }}
            >
              <span className="flex w-full items-center gap-2">
                <LogOut className="h-4 w-4 shrink-0 text-[#86efac]/90" strokeWidth={1.75} aria-hidden />
                {signingOut ? t("signingOut") : t("signOut")}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
