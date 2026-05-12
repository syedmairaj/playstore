"use client";

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[locale-error]", error);
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      void import("@sentry/nextjs").then((Sentry) => {
        Sentry.captureException(error);
      });
    }
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="max-w-md rounded-2xl border border-border/80 bg-card/80 p-8 shadow-lg backdrop-blur-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Something went wrong</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">We hit a snag</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This page could not be loaded. Your work is safe — try again or return home.
        </p>
        {error.digest ? (
          <p className="mt-4 font-mono text-[11px] text-muted-foreground">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button type="button" onClick={() => reset()} className="min-w-[140px]">
            Try again
          </Button>
          <Button variant="outline" asChild className="min-w-[140px]">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
