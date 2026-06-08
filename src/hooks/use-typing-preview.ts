"use client";

import { useEffect, useRef, useState } from "react";

type Fields = {
  title: string;
  shortDescription: string;
  fullDescription: string;
};

const emptyFields: Fields = {
  title: "",
  shortDescription: "",
  fullDescription: "",
};

/**
 * Reveals text character-by-character for a “typing into the preview” feel.
 */
export function useTypingPreview(
  target: Fields | null,
  enabled: boolean,
  charsPerTick = 2,
  tickMs = 18,
) {
  const [display, setDisplay] = useState<Fields>(emptyFields);
  const frameRef = useRef<number | null>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (!enabled || !target) {
      setDisplay(target ?? emptyFields);
      idxRef.current = 0;
      return;
    }

    setDisplay(emptyFields);
    idxRef.current = 0;

    const full = `${target.title}\u0001${target.shortDescription}\u0001${target.fullDescription}`;
    let last = performance.now();

    const step = (now: number) => {
      const elapsed = now - last;
      if (elapsed < tickMs) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }
      last = now;
      idxRef.current = Math.min(
        full.length,
        idxRef.current + charsPerTick,
      );
      const slice = full.slice(0, idxRef.current);
      const parts = slice.split("\u0001");
      const title = parts[0] ?? "";
      const shortDescription = parts[1] ?? "";
      const fullDescription = parts.slice(2).join("\u0001");
      setDisplay({ title, shortDescription, fullDescription });

      if (idxRef.current < full.length) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [
    enabled,
    target?.title,
    target?.shortDescription,
    target?.fullDescription,
  ]);

  return display;
}
