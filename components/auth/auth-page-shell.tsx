"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useAuthModal } from "./auth-modal-context";
import type { AuthIntent } from "./auth-modal-context";

/**
 * Known `?error=...` flags from `/auth/callback`. Anything else is rendered
 * as the generic notice so we never echo arbitrary URL content as a label.
 */
const KNOWN_ERROR_KEYS = ["database_sync_issue"] as const;
type KnownErrorKey = (typeof KNOWN_ERROR_KEYS)[number];

function isKnownErrorKey(value: string | null): value is KnownErrorKey {
  return value != null && (KNOWN_ERROR_KEYS as readonly string[]).includes(value);
}

function AuthPageShellInner({ intent }: { intent: AuthIntent }) {
  const { openAuth } = useAuthModal();
  const t = useTranslations("authPage");
  const tErr = useTranslations("authPage.errors");
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const errorKey = isKnownErrorKey(errorParam) ? errorParam : null;
  const hasUnknownError = errorParam != null && errorKey == null;

  useEffect(() => {
    openAuth(intent);
  }, [intent, openAuth]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-4 py-20 text-center">
      {errorKey || hasUnknownError ? (
        <div
          role="alert"
          className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {errorKey ? tErr(errorKey) : tErr("generic")}
        </div>
      ) : null}
      <p className="max-w-sm text-sm text-muted-foreground">{t("hint")}</p>
      <Button asChild variant="outline" className="transition duration-200">
        <Link href="/">{t("home")}</Link>
      </Button>
    </div>
  );
}

export function AuthPageShell({ intent }: { intent: AuthIntent }) {
  // `useSearchParams` requires a Suspense boundary at the route level.
  return (
    <Suspense fallback={null}>
      <AuthPageShellInner intent={intent} />
    </Suspense>
  );
}
