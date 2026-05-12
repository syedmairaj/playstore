"use client";

import { CreditsBar } from "@/components/app/CreditsBar";
import { WorkspaceSwitcher } from "@/components/dashboard/WorkspaceSwitcher";

type Props = {
  workspaceId: string;
  workspaceName: string;
  workspaces: { id: string; name: string }[];
  creditsRemaining: number;
  creditsAllocation: number;
  hubLabel: string;
};

export function WorkspaceAppHeader({
  workspaceId,
  workspaceName,
  workspaces,
  creditsRemaining,
  creditsAllocation,
  hubLabel,
}: Props) {
  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] bg-[#0B0E14]/95 px-4 py-3 backdrop-blur-md sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
          {hubLabel}
        </p>
        <h1 className="truncate text-base font-semibold text-white sm:text-lg">{workspaceName}</h1>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <WorkspaceSwitcher currentId={workspaceId} workspaces={workspaces} />
        <CreditsBar
          balance={creditsRemaining}
          monthlyAllocation={creditsAllocation}
          workspaceId={workspaceId}
          className="border-white/15 bg-white/[0.06] text-white [&_.text-muted-foreground]:text-white/50"
        />
      </div>
    </header>
  );
}
