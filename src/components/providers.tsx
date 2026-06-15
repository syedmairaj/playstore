"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { SentryClientInit } from "@/components/providers/sentry-client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <SentryClientInit />
      {children}
      <Toaster richColors theme="dark" position="bottom-right" closeButton />
    </ThemeProvider>
  );
}
