"use client";

import { useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default function AppShellError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      void import("@sentry/nextjs").then((Sentry) => {
        Sentry.captureException(error);
      });
    }
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <div className="max-w-md rounded-2xl border border-border/80 bg-card p-8 shadow-md">
        <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Workspace</p>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground">This workspace view failed</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Retry the request. If it keeps happening, open another workspace from the switcher or go home.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button type="button" onClick={() => reset()}>
            Retry
          </Button>
          <Button variant="outline" asChild>
            <Link href="/app">App hub</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
