"use client";

import { Link } from "@/i18n/navigation";
import { normalizePlan, PLAN_META, type PlanId, UNLIMITED_APP_SLOTS } from "@/lib/plan-limits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type UpgradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Normalized plan slug from limits API. */
  plan: string;
  currentCount: number;
  appLimit: number;
  onUpgrade?: () => void;
};

function formatLimit(limit: number): string {
  if (limit === UNLIMITED_APP_SLOTS) return "Unlimited";
  return String(limit);
}

export function UpgradeModal({
  open,
  onOpenChange,
  plan,
  currentCount,
  appLimit,
  onUpgrade,
}: UpgradeModalProps) {
  const pid = normalizePlan(plan) as PlanId;
  const meta = PLAN_META[pid];
  const growth = PLAN_META.growth;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md border border-white/10 bg-[#0f1319] p-0 text-white shadow-2xl sm:rounded-2xl"
        overlayClassName="bg-black/75 backdrop-blur-md"
        closeButtonClassName="text-white/60 hover:bg-white/10 hover:text-white"
      >
        <div className="border-b border-white/[0.07] bg-gradient-to-br from-[#22C55E]/12 to-transparent px-6 pb-5 pt-6">
          <DialogHeader className="space-y-2 text-start">
            <DialogTitle className="text-xl font-semibold tracking-tight text-white">
              You&apos;ve reached your plan limit
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-white/60">
              You&apos;re on <span className="font-medium text-white/90">{meta.label}</span> (
              {formatLimit(appLimit)} app{appLimit === 1 ? "" : "s"}). You already have{" "}
              <span className="font-medium text-[#86efac]">{currentCount}</span> in this workspace.
              Upgrade to <span className="font-medium text-[#86efac]">{growth.label}</span> (
              {`$${growth.priceMonthly}`}/mo) for unlimited apps, {growth.aiCreditsMonthly} AI credits per
              month, and full keyword tracking headroom.
            </DialogDescription>
          </DialogHeader>
        </div>

        <DialogFooter className="flex flex-col gap-2 border-t border-white/[0.06] bg-[#0b0e14] px-6 py-5 sm:flex-col sm:space-x-0">
          {onUpgrade ? (
            <Button
              type="button"
              className="h-11 w-full rounded-xl bg-[#22C55E] text-base font-semibold text-white shadow-lg shadow-[#22C55E]/20 hover:bg-[#16a34a]"
              onClick={() => {
                onUpgrade();
                onOpenChange(false);
              }}
            >
              Upgrade to Growth
            </Button>
          ) : (
            <Button
              type="button"
              asChild
              className="h-11 w-full rounded-xl bg-[#22C55E] text-base font-semibold text-white shadow-lg shadow-[#22C55E]/20 hover:bg-[#16a34a]"
            >
              <Link href="/pricing">Upgrade to Growth</Link>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className="h-10 w-full rounded-xl text-white/70 hover:bg-white/[0.06] hover:text-white"
            onClick={() => onOpenChange(false)}
          >
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
