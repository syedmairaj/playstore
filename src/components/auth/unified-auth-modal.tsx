"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PlayStoreLogo } from "@/components/marketing/PlayStoreLogo";
import { cn } from "@/lib/utils";
import type { AuthIntent } from "./auth-modal-context";

/**
 * Google OAuth + email magic link via Supabase (preserves auth.uid() RLS).
 * Clerk can replace this after Supabase third-party JWT / claims are wired.
 */
function UnifiedAuthModalInner(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intent: AuthIntent;
}) {
  const t = useTranslations("auth");
  const params = useParams<{ locale: string }>();
  const loc = params.locale ?? "en";
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") ?? `/${loc}/app`;

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const callbackNext = encodeURIComponent(nextParam.startsWith("/") ? nextParam : `/${loc}/app`);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function signInGoogle() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: oAuthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${callbackNext}`,
        queryParams: { prompt: "select_account" },
      },
    });
    setLoading(false);
    if (oAuthError) setError(oAuthError.message);
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${callbackNext}`,
      },
    });
    setLoading(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setInfo(t("checkEmail"));
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        closeButtonClassName="text-white/70 hover:text-white hover:opacity-100 ring-offset-[#0B0E14] focus:ring-[#22C55E]/50 data-[state=open]:bg-white/10 data-[state=open]:text-white"
        className={cn(
          "max-h-[min(90vh,720px)] max-w-[calc(100vw-1.5rem)] gap-0 overflow-y-auto rounded-2xl border border-white/10 bg-[#0B0E14] p-0 font-sans shadow-2xl sm:max-w-[440px]",
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <AnimatePresence mode="wait">
          {props.open ? (
            <motion.div
              key="auth-panel"
              initial={{ opacity: 0, scale: 0.97, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="relative px-6 pb-8 pt-10 sm:px-10 sm:pb-10 sm:pt-11"
            >
              <div className="relative mb-7 flex flex-col items-center text-center">
                <PlayStoreLogo
                  showText={false}
                  size="lg"
                  brand="play"
                  className="mb-4"
                />
                <p className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                  {t("welcomeHeadline")}
                </p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#22C55E]">
                  {t("modalTagline")}
                </p>
              </div>

              <DialogHeader className="relative space-y-2 text-center">
                <DialogTitle className="sr-only">{t("welcomeHeadline")}</DialogTitle>
                <DialogDescription className="text-[15px] leading-relaxed text-[#94A3B8]">
                  {props.intent === "signup" ? t("subtitleSignup") : t("subtitleSignin")}
                </DialogDescription>
              </DialogHeader>

              <div className="relative mt-7 space-y-5">
                <Button
                  type="button"
                  size="lg"
                  className="h-[3.25rem] w-full gap-3 rounded-xl border border-white/10 bg-white text-base font-semibold text-neutral-900 shadow-md transition duration-200 hover:bg-white/95 disabled:opacity-60"
                  disabled={loading}
                  onClick={() => void signInGoogle()}
                >
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#22C55E"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  {t("google")}
                </Button>

                <div className="relative py-0.5">
                  <Separator className="bg-white/10" />
                  <span className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0B0E14] px-3 text-xs font-medium text-[#94A3B8]">
                    {t("divider")}
                  </span>
                </div>

                <form className="space-y-3" onSubmit={sendMagicLink}>
                  <div className="space-y-2 text-start">
                    <Label
                      htmlFor="auth-magic-email"
                      className="text-sm font-medium text-[#94A3B8]"
                    >
                      {t("magic")}
                    </Label>
                    <Input
                      id="auth-magic-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("emailPlaceholder")}
                      className="h-12 rounded-lg border border-white/10 bg-white/5 text-base text-white shadow-none ring-offset-[#0B0E14] placeholder:text-slate-500 focus-visible:border-[#22C55E] focus-visible:ring-2 focus-visible:ring-[#22C55E]/35 focus-visible:ring-offset-0"
                    />
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    className="h-12 w-full rounded-lg border-0 bg-[#22C55E] py-3 text-base font-bold text-white shadow-[0_0_20px_rgba(34,197,94,0.2)] transition-all duration-200 hover:bg-[#4ade80] disabled:opacity-60"
                    disabled={loading}
                  >
                    {loading ? t("sending") : t("sendLink")}
                  </Button>
                </form>

                {info ? (
                  <p
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-sm text-[#94A3B8]"
                    role="status"
                  >
                    {info}
                  </p>
                ) : null}
                {error ? (
                  <p
                    className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-center text-sm text-red-200"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

export function UnifiedAuthModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intent: AuthIntent;
}) {
  return (
    <Suspense fallback={null}>
      <UnifiedAuthModalInner {...props} />
    </Suspense>
  );
}
