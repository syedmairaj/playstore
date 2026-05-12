import { Suspense } from "react";
import { LiveDemoButton } from "@/components/marketing/LiveDemoButton";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#0B0E14] text-zinc-100 antialiased">
      <Suspense fallback={<div className="h-14 border-b border-border bg-background/80" />}>
        <SiteHeader />
      </Suspense>
      <div className="flex-1">{children}</div>
      <SiteFooter />
      <LiveDemoButton />
    </div>
  );
}
