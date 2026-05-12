"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useAuthModal } from "./auth-modal-context";
import type { AuthIntent } from "./auth-modal-context";

export function AuthPageShell({ intent }: { intent: AuthIntent }) {
  const { openAuth } = useAuthModal();
  const t = useTranslations("authPage");

  useEffect(() => {
    openAuth(intent);
  }, [intent, openAuth]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-4 py-20 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">{t("hint")}</p>
      <Button asChild variant="outline" className="transition duration-200">
        <Link href="/">{t("home")}</Link>
      </Button>
    </div>
  );
}
