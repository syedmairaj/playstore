"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function CreditsBar(props: {
  balance: number;
  monthlyAllocation: number;
  workspaceId: string;
  className?: string;
}) {
  const t = useTranslations("credits");
  const [open, setOpen] = useState(false);
  const b = Math.max(0, props.balance);
  const low = b > 0 && b <= Math.max(5, Math.floor(props.monthlyAllocation * 0.1));
  const empty = b === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => (low || empty ? setOpen(true) : undefined)}
        className={cn(
          "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
          empty && "border-destructive/50 bg-destructive/10",
          low && !empty && "border-amber-500/40 bg-amber-500/10",
          !low && !empty && "border-border bg-muted/40 hover:bg-muted/60",
          props.className,
        )}
      >
        <span className="text-muted-foreground">{t("label")}</span>
        <Badge variant={empty ? "destructive" : low ? "warning" : "secondary"} className="font-mono">
          {b}
        </Badge>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{empty ? t("emptyTitle") : t("lowTitle")}</DialogTitle>
            <DialogDescription>{empty ? t("emptyBody") : t("lowBody")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("balance", { count: b })}</p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button asChild variant="secondary" className="w-full">
              <a href="mailto:hello@playstore.xyz?subject=AI%20credits%20top-up">{t("topUp")}</a>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/pricing">{t("viewPlans")}</Link>
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => setOpen(false)}>
              {t("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
