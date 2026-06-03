"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthModal } from "@/components/auth/auth-modal-context";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const t = useTranslations("dashboard");
  const { closeAuth } = useAuthModal();
  const [loading, setLoading] = useState(false);

  function signOut() {
    setLoading(true);
    closeAuth();
    window.location.assign(new URL("/auth/signout", window.location.origin).toString());
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={loading}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors md:self-start",
        "border-white/15 text-white/70 hover:bg-white/[0.06] hover:text-white",
        className,
      )}
    >
      {loading ? t("signingOut") : t("signOut")}
    </button>
  );
}
