"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-9 w-9 shrink-0 text-white hover:bg-white/[0.08]", className)}
      aria-label="Toggle light or dark theme"
      disabled={!mounted}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <span className="relative block h-4 w-4">
        {!mounted ? (
          <span className="absolute inset-0 block rounded-full bg-white/15" aria-hidden />
        ) : isDark ? (
          <Sun className="absolute inset-0 h-4 w-4" aria-hidden />
        ) : (
          <Moon className="absolute inset-0 h-4 w-4" aria-hidden />
        )}
      </span>
    </Button>
  );
}
