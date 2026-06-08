"use client";

/**
 * LogoGeneratorDialog — thin Dialog shell around the shared AppIconGenerator.
 *
 * Kept at this path so ListingOptimizer.tsx requires zero import changes.
 * All generation logic lives in @/components/shared/AppIconGenerator.
 */

import { useLocale, useTranslations } from "next-intl";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  AppIconGenerator,
  type AppIconGeneratorProps,
} from "@/components/shared/AppIconGenerator";
import type { AppLogoGeneratorMetadata } from "@/lib/apps/logo-generator-metadata";

// Props are the same as before — unchanged so ListingOptimizer needs no edits.
type LogoGeneratorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  appId: string;
  appName: string;
  category: string;
  shortDescription: string;
  creditsRemaining: number | null;
  onCreditsRemaining: (n: number) => void;
  /** Called on icon tap (live preview) and on "Use this icon" (apply). */
  onLogoSelected: (httpsUrl: string) => void;
  onLogoGeneratorPersisted?: () => void;
  initialLogoGenerator?: AppLogoGeneratorMetadata | null;
  plan?: string;
  onRequestUpgrade?: () => void;
};

export function LogoGeneratorDialog(props: LogoGeneratorDialogProps) {
  const locale = useLocale();
  const isAr = locale === "ar";
  const t = useTranslations("optimizer.logo");

  // Map old prop names → AppIconGeneratorProps
  const generatorProps: AppIconGeneratorProps = {
    workspaceId: props.workspaceId,
    appId: props.appId,
    appName: props.appName,
    category: props.category,
    shortDescription: props.shortDescription,
    creditsRemaining: props.creditsRemaining,
    onCreditsRemaining: props.onCreditsRemaining,
    onIconSelected: props.onLogoSelected,
    onIconPersisted: props.onLogoGeneratorPersisted,
    initialLogoGenerator: props.initialLogoGenerator,
    plan: props.plan,
    onRequestUpgrade: props.onRequestUpgrade,
    // Closing the dialog on "Use this icon"
    onRequestClose: () => props.onOpenChange(false),
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className={cn(
          "max-h-[min(92vh,860px)] max-w-[min(96vw,680px)] overflow-y-auto border border-white/[0.1] bg-[#0c1018] p-0 text-white shadow-2xl sm:rounded-2xl",
          isAr && "font-arabic",
        )}
        overlayClassName="bg-black/70 backdrop-blur-md"
      >
        {/* DialogTitle always in DOM for Radix accessibility */}
        <VisuallyHidden.Root asChild>
          <DialogTitle>{t("title")}</DialogTitle>
        </VisuallyHidden.Root>

        <AppIconGenerator key={props.appId} {...generatorProps} />
      </DialogContent>
    </Dialog>
  );
}
