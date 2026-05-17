"use client";

import { Loader2, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { StoredCompetitor } from "@/lib/competitors/normalize-stored-competitor";
import { cn } from "@/lib/utils";

export type CompetitorSpyManageSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isRtl: boolean;
  competitors: StoredCompetitor[];
  selectedCompetitorId: string | null;
  onSelect: (id: string) => void;
  onDelete: (competitor: StoredCompetitor) => void;
  deletePendingId: string | null;
};

export function CompetitorSpyManageSheet({
  open,
  onOpenChange,
  isRtl,
  competitors,
  selectedCompetitorId,
  onSelect,
  onDelete,
  deletePendingId,
}: CompetitorSpyManageSheetProps) {
  const t = useTranslations("competitorSpy.manage");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRtl ? "left" : "right"}
        dir={isRtl ? "rtl" : "ltr"}
        className={cn(
          "border-white/[0.08] bg-[#0c1018] text-zinc-100 sm:max-w-md",
          isRtl && "font-arabic",
        )}
      >
        <SheetHeader className="text-start">
          <SheetTitle className="flex items-center gap-2 text-white">
            <Users className="size-5 text-emerald-400/90" aria-hidden />
            {t("title")}
          </SheetTitle>
          <SheetDescription className="text-zinc-400">{t("description")}</SheetDescription>
        </SheetHeader>

        <ul className="mt-6 space-y-2">
          {competitors.map((c) => {
            const isActive = c.id === selectedCompetitorId;
            const deleting = deletePendingId === c.id;
            return (
              <li key={c.id}>
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                    isActive
                      ? "border-emerald-500/35 bg-emerald-500/10"
                      : "border-white/[0.08] bg-[#070a0f]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(c.id);
                      onOpenChange(false);
                    }}
                    className="min-w-0 flex-1 text-start"
                  >
                    <span className="block truncate font-medium text-zinc-100">{c.displayName}</span>
                    <span className="block truncate font-mono text-[11px] text-zinc-500">
                      {c.packageId}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-300"
                    disabled={deleting}
                    aria-label={t("deleteAria", { name: c.displayName })}
                    onClick={() => onDelete(c)}
                  >
                    {deleting ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="size-4" aria-hidden />
                    )}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
