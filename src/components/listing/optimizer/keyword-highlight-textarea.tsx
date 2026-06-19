"use client";

import { useCallback, useEffect, useRef } from "react";
import { segmentTextByKeywords } from "@/lib/listing/keyword-highlight";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  lockedKeywords: string[];
  disabled?: boolean;
  isRtl?: boolean;
  rows?: number;
  maxLength: number;
  label: string;
  counterId: string;
  counter: React.ReactNode;
  placeholder?: string;
};

const SHARED_EDITOR_CLASS =
  "w-full resize-y rounded-lg border border-zinc-700 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words";

export function KeywordHighlightTextarea({
  id,
  value,
  onChange,
  lockedKeywords,
  disabled = false,
  isRtl = false,
  rows = 12,
  maxLength,
  label,
  counterId,
  counter,
  placeholder,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const backdrop = backdropRef.current;
    if (!textarea || !backdrop) return;
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  }, []);

  useEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  const segments = segmentTextByKeywords(value, lockedKeywords);

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-[11px] font-medium text-zinc-400"
      >
        {label}
      </label>
      <div className="relative overflow-hidden rounded-lg border border-zinc-700 bg-black/30">
        <div
          ref={backdropRef}
          aria-hidden
          className={cn(
            SHARED_EDITOR_CLASS,
            "pointer-events-none absolute inset-0 overflow-auto border-transparent bg-transparent text-transparent",
            isRtl && "text-end",
          )}
          style={{ minHeight: `${rows * 1.5}rem` }}
        >
          {value ? (
            segments.map((segment, index) =>
              segment.highlighted ? (
                <mark
                  key={`${index}-${segment.text}`}
                  className="rounded-sm bg-emerald-400/25 text-transparent ring-1 ring-emerald-400/40"
                >
                  {segment.text}
                </mark>
              ) : (
                <span key={`${index}-${segment.text}`}>{segment.text}</span>
              ),
            )
          ) : (
            <span>{placeholder ?? ""}</span>
          )}
        </div>
        <textarea
          ref={textareaRef}
          id={id}
          rows={rows}
          maxLength={maxLength}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onScroll={syncScroll}
          aria-describedby={counterId}
          dir={isRtl ? "rtl" : "ltr"}
          className={cn(
            SHARED_EDITOR_CLASS,
            "relative z-[1] bg-transparent text-white caret-white",
            isRtl && "text-end",
          )}
          style={{ minHeight: `${rows * 1.5}rem` }}
        />
      </div>
      <div className={cn("mt-2 flex", isRtl ? "justify-end" : "justify-start")}>
        {counter}
      </div>
    </div>
  );
}
