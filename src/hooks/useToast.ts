/**
 * Toast Notification Hook
 *
 * Simple hook for displaying toast messages with auto-dismiss.
 * Used by staging buttons to confirm success/error.
 */

import { useCallback } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  type: ToastType;
  title: string;
  message: string;
  duration?: number; // ms (default 3000)
  id?: string; // Generated if not provided
}

// Global toast state (in a real app, use Context or state management)
let toastSubscribers: Array<(toast: ToastMessage) => void> = [];
let toastId = 0;

export function useToast() {
  const showToast = useCallback((toast: ToastMessage) => {
    const id = `toast-${++toastId}`;
    const toastWithId = { ...toast, id };

    // Notify all subscribers
    toastSubscribers.forEach((subscriber) => subscriber(toastWithId));

    // Auto-dismiss after duration
    const duration = toast.duration || 3000;
    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }

    return id;
  }, []);

  return { showToast };
}

export function dismissToast(id: string) {
  toastSubscribers.forEach((subscriber) =>
    subscriber({ id, type: "info", title: "", message: "", duration: 0 })
  );
}

export function subscribeToToasts(
  callback: (toast: ToastMessage) => void
): () => void {
  toastSubscribers.push(callback);
  return () => {
    toastSubscribers = toastSubscribers.filter((sub) => sub !== callback);
  };
}
