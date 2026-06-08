"use client";

import { useEffect } from "react";

/** Optional client monitoring; set NEXT_PUBLIC_SENTRY_DSN (same project DSN as server is fine). */
export function SentryClientInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    let cancelled = false;
    void import("@sentry/nextjs").then((Sentry) => {
      if (cancelled) return;
      Sentry.init({
        dsn,
        tracesSampleRate: 0.05,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
