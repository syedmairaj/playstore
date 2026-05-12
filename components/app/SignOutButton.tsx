"use client";

import { useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
    setLoading(false);
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
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
