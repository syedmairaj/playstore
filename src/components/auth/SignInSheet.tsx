"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { AuthModalTrigger } from "./auth-modal-trigger";
import type { AuthIntent } from "./auth-modal-context";

type LegacyIntent = "login" | "signup";

/** @deprecated Prefer AuthModalTrigger with intent "signin" | "signup". */
export function SignInSheet(props: {
  intent?: LegacyIntent;
  mode?: "button" | "link";
  label: string;
  variant?: ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  const mapped: AuthIntent = props.intent === "login" ? "signin" : "signup";
  return (
    <AuthModalTrigger
      intent={mapped}
      mode={props.mode}
      label={props.label}
      variant={props.variant}
      className={props.className}
    />
  );
}
