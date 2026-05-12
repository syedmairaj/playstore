"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

export type AuthIntent = "signin" | "signup";

type AuthModalContextValue = {
  openAuth: (intent: AuthIntent) => void;
  closeAuth: () => void;
  onOpenChange: (open: boolean) => void;
  isOpen: boolean;
  intent: AuthIntent;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) {
    throw new Error("useAuthModal must be used within AuthModalProvider");
  }
  return ctx;
}

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<AuthIntent>("signup");
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();

  const isAuthRoute = pathname === "/login" || pathname === "/signup";

  useEffect(() => {
    if (pathname.endsWith("/login")) {
      setIntent("signin");
      setOpen(true);
    } else if (pathname.endsWith("/signup")) {
      setIntent("signup");
      setOpen(true);
    } else {
      // Home and other routes: keep modal closed (e.g. after sign-out to `/`, not `/login`).
      setOpen(false);
    }
  }, [pathname]);

  const openAuth = useCallback((next: AuthIntent) => {
    setIntent(next);
    setOpen(true);
  }, []);

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && isAuthRoute) {
        router.replace("/", { locale: locale as "en" | "ar" });
      }
    },
    [isAuthRoute, router, locale],
  );

  const closeAuth = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const value = useMemo(
    () => ({
      openAuth,
      closeAuth,
      onOpenChange,
      isOpen: open,
      intent,
    }),
    [openAuth, closeAuth, onOpenChange, open, intent],
  );

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>;
}
