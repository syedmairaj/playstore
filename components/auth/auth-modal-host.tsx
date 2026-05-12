"use client";

import { useAuthModal } from "./auth-modal-context";
import { UnifiedAuthModal } from "./unified-auth-modal";

export function AuthModalHost() {
  const { isOpen, intent, onOpenChange } = useAuthModal();
  return <UnifiedAuthModal open={isOpen} onOpenChange={onOpenChange} intent={intent} />;
}
