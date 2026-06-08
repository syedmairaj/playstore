"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AiCreditsModal } from "@/components/ui/ai-credits-modal";
import { cn } from "@/lib/utils";

export function CreditsBar(props: {
  balance: number;
  monthlyAllocation: number;
  workspaceId: string;
  /** Normalized billing plan (`free` | `pro` | `growth`). */
  workspacePlan: string;
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
        data-workspace-id={props.workspaceId}
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

      <AiCreditsModal
        open={open}
        onOpenChange={setOpen}
        balance={b}
        variant={empty ? "empty" : "low"}
        workspacePlan={props.workspacePlan}
        workspaceId={props.workspaceId}
      />
    </>
  );
}
