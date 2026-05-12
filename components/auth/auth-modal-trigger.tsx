"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthModal } from "./auth-modal-context";
import type { AuthIntent } from "./auth-modal-context";

export function AuthModalTrigger(props: {
  intent: AuthIntent;
  mode?: "button" | "link";
  label: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  const { intent, mode = "button", label, variant = "default", className } = props;
  const { openAuth } = useAuthModal();

  if (mode === "link") {
    return (
      <button
        type="button"
        className={cn("text-sm font-medium text-primary transition-colors hover:text-primary/90", className)}
        onClick={() => openAuth(intent)}
      >
        {label}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={cn("transition duration-200 active:scale-[0.98]", className)}
      onClick={() => openAuth(intent)}
    >
      {label}
    </Button>
  );
}
