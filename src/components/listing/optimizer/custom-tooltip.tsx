"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

const TOOLTIP_MAX_WIDTH = 240;
const VIEWPORT_GUTTER = 12;

type Props = {
  description: string;
  ariaLabel?: string;
  isRtl?: boolean;
  children: ReactNode;
};

export function CustomTooltip({
  description,
  ariaLabel,
  isRtl,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: TOOLTIP_MAX_WIDTH });

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2);
    const centerX = rect.left + rect.width / 2;
    const left = Math.min(
      Math.max(centerX - width / 2, VIEWPORT_GUTTER),
      window.innerWidth - width - VIEWPORT_GUTTER,
    );
    const top = rect.top - 10;

    setCoords({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  const tooltip =
    typeof document !== "undefined"
      ? createPortal(
          <AnimatePresence>
            {open ? (
              <motion.div
                role="tooltip"
                aria-label={ariaLabel ?? description}
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                style={{
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                  width: coords.width,
                  transform: "translateY(-100%)",
                  zIndex: 9999,
                }}
                className={cn(
                  "pointer-events-none rounded-xl border border-white/10 bg-gray-900/90 p-3 shadow-[0_10px_32px_-8px_rgba(0,0,0,0.55)] backdrop-blur-md",
                  isRtl ? "text-right" : "text-left",
                )}
              >
                <p className="relative text-[11px] leading-relaxed text-zinc-300">
                  {description}
                </p>
                <span
                  className={cn(
                    "absolute -bottom-1.5 size-3 rotate-45 border border-white/10 bg-gray-900/90 backdrop-blur-md",
                    isRtl ? "right-5" : "left-1/2 -translate-x-1/2",
                  )}
                  aria-hidden
                />
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <div
      ref={triggerRef}
      className="relative w-full min-w-0"
      onMouseEnter={() => {
        setOpen(true);
        updatePosition();
      }}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => {
        setOpen(true);
        updatePosition();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      {children}
      {tooltip}
    </div>
  );
}
