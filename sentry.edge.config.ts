import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.02,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
