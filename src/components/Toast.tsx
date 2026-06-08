/**
 * Toast Notification Component
 *
 * Renders toast messages with auto-dismiss.
 * Place this once in your layout (e.g., in app.tsx or layout.tsx).
 */

"use client";

import { useState, useEffect } from "react";
import { subscribeToToasts, type ToastMessage } from "@/hooks/useToast";
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

export function ToastContainer() {
  const [toasts, setToasts] = useState<Map<string, ToastMessage>>(new Map());

  useEffect(() => {
    const unsubscribe = subscribeToToasts((toast) => {
      setToasts((prev) => {
        const next = new Map(prev);

        // If empty id/title/message, remove it (dismiss)
        if (!toast.id || (!toast.title && !toast.message)) {
          next.delete(toast.id || "");
        } else {
          next.set(toast.id || "", toast);
        }

        return next;
      });
    });

    return unsubscribe;
  }, []);

  if (toasts.size === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {Array.from(toasts.values()).map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function Toast({ toast }: { toast: ToastMessage }) {
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      // Actually remove from list
    }, 300); // Match animation duration
  };

  const iconMap: Record<string, React.ReactNode> = {
    success: <CheckCircle className="w-5 h-5 text-green-600" />,
    error: <AlertCircle className="w-5 h-5 text-red-600" />,
    info: <Info className="w-5 h-5 text-blue-600" />,
    warning: <AlertTriangle className="w-5 h-5 text-yellow-600" />,
  };

  const bgMap: Record<string, string> = {
    success: "bg-green-50 border-green-200",
    error: "bg-red-50 border-red-200",
    info: "bg-blue-50 border-blue-200",
    warning: "bg-yellow-50 border-yellow-200",
  };

  const titleMap: Record<string, string> = {
    success: "text-green-900",
    error: "text-red-900",
    info: "text-blue-900",
    warning: "text-yellow-900",
  };

  const messageMap: Record<string, string> = {
    success: "text-green-800",
    error: "text-red-800",
    info: "text-blue-800",
    warning: "text-yellow-800",
  };

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-lg border
        ${bgMap[toast.type]}
        ${isExiting ? "opacity-0 translate-x-full" : "opacity-100 translate-x-0"}
        transition-all duration-300 ease-out
      `}
    >
      <div className="flex-shrink-0 pt-0.5">{iconMap[toast.type]}</div>

      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className={`font-semibold text-sm ${titleMap[toast.type]}`}>
            {toast.title}
          </p>
        )}
        {toast.message && (
          <p className={`text-sm mt-1 ${messageMap[toast.type]}`}>
            {toast.message}
          </p>
        )}
      </div>

      <button
        onClick={handleDismiss}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
