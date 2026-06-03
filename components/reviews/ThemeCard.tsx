"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ThemeCardThemeKey = "performance" | "bugs" | "pricing" | "features" | "ux";

export type ThemeCardProps = {
  themeKey: ThemeCardThemeKey;
  mentionCount: number;
  added: boolean;
  onAdd: () => void;
};

export function ThemeCard({ themeKey, mentionCount, added, onAdd }: ThemeCardProps) {
  const t = useTranslations("reviews");

  return (
    <Card className="border-white/[0.08] bg-[#0c1018] text-zinc-100 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]">
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="text-base font-semibold text-white">
          {t(`commonIssues.themes.${themeKey}`)}
        </CardTitle>
        <CardDescription className="text-zinc-500">
          {t("commonIssues.mentions", { count: mentionCount })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          size="sm"
          disabled={added}
          className={cn(
            "w-full sm:w-auto",
            added
              ? "cursor-not-allowed border border-slate-700 bg-slate-800 text-emerald-400/90 hover:bg-slate-800"
              : "bg-emerald-600 text-white hover:bg-emerald-500",
          )}
          variant={added ? "outline" : "default"}
          onClick={onAdd}
        >
          {added ? t("row.addedToQueue") : t("commonIssues.addToListing")}
        </Button>
      </CardContent>
    </Card>
  );
}
