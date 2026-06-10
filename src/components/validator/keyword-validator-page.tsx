/**
 * Keyword Validator Page Component
 *
 * Full page for Quick Win Keyword Validator.
 * Allows users to:
 * - Validate single keywords
 * - Batch validate multiple keywords
 * - See viability scores
 * - Get recommendations
 * - Add to staging vault
 */

"use client";

import React, { useState } from "react";
import { useCallback } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { KeywordValidatorCard } from "./keyword-validator-card";
import type { KeywordViabilityScore } from "./keyword-validator-card";

interface KeywordValidatorPageProps {
  workspaceId: string;
  locale: string;
}

export function KeywordValidatorPage({
  workspaceId,
  locale,
}: KeywordValidatorPageProps) {
  const isRtl = locale === "ar";

  // State
  const [inputValue, setInputValue] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [validatingKeyword, setValidatingKeyword] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, KeywordViabilityScore>>({});
  const [error, setError] = useState<string | null>(null);

  // Validate single keyword
  const validateKeyword = useCallback(
    async (keyword: string) => {
      if (!keyword.trim()) return;

      setValidatingKeyword(keyword);
      setError(null);

      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/validator/validate-keyword`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keyword: keyword.trim(),
              category: "default",
              language: locale,
            }),
          }
        );

        const data = await response.json();

        if (!data.ok) {
          setError(data.error?.message || "Validation failed");
          return;
        }

        setResults((prev) => ({
          ...prev,
          [keyword]: data.data,
        }));

        // Add to keywords list if not already there
        if (!keywords.includes(keyword)) {
          setKeywords((prev) => [...prev, keyword]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Validation error");
      } finally {
        setValidatingKeyword(null);
      }
    },
    [workspaceId, locale, keywords]
  );

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      validateKeyword(inputValue);
      setInputValue("");
    }
  };

  // Remove result
  const removeResult = useCallback((keyword: string) => {
    setKeywords((prev) => prev.filter((k) => k !== keyword));
    setResults((prev) => {
      const next = { ...prev };
      delete next[keyword];
      return next;
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6"
      >
        <label className="block text-sm font-medium text-zinc-300 mb-3">
          {locale === "ar"
            ? "أدخل كلمة مفتاحية للتحقق"
            : "Enter keyword to validate"}
        </label>

        <div className={cn("flex gap-2", isRtl && "flex-row-reverse")}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              locale === "ar"
                ? "مثال: محرر الصور"
                : "Example: photo editor"
            }
            className={cn(
              "flex-1 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2.5",
              "text-white placeholder-zinc-500",
              "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
              isRtl && "text-right"
            )}
            disabled={!!validatingKeyword}
          />

          <button
            onClick={() => {
              validateKeyword(inputValue);
              setInputValue("");
            }}
            disabled={!inputValue.trim() || !!validatingKeyword}
            className={cn(
              "px-4 py-2.5 rounded-lg font-medium text-sm",
              "bg-blue-600 hover:bg-blue-700 text-white",
              "transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "flex items-center gap-2",
              isRtl && "flex-row-reverse"
            )}
          >
            {validatingKeyword ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {locale === "ar" ? "جاري..." : "Validating..."}
              </>
            ) : (
              <>
                <Search className="size-4" />
                {locale === "ar" ? "تحقق" : "Validate"}
              </>
            )}
          </button>
        </div>

        {/* Tips */}
        <div className={cn("mt-4 p-3 rounded-lg bg-zinc-800/50 text-xs text-zinc-400", isRtl && "text-right")}>
          💡{" "}
          {locale === "ar"
            ? "جرب كلمات مفتاحية مختلفة الطول والصيغة"
            : "Try keywords of different lengths and formats"}
        </div>
      </motion.div>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border border-red-500/30 bg-red-900/20 p-4 flex items-start gap-3"
        >
          <AlertCircle className="size-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </motion.div>
      )}

      {/* Results Section */}
      {keywords.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className={cn("flex items-center justify-between", isRtl && "flex-row-reverse")}>
            <h2 className="text-lg font-semibold text-white">
              {locale === "ar"
                ? `النتائج (${keywords.length})`
                : `Results (${keywords.length})`}
            </h2>
          </div>

          <div className="grid gap-4">
            {keywords.map((keyword) => {
              const result = results[keyword];
              if (!result) return null;

              return (
                <motion.div
                  key={keyword}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="relative"
                >
                  <KeywordValidatorCard
                    keyword={result}
                    locale={locale}
                    isRtl={isRtl}
                    onSelect={() => {
                      // TODO: Add to staging vault
                      console.log("Add to staging:", keyword);
                    }}
                  />

                  {/* Remove Button */}
                  <button
                    onClick={() => removeResult(keyword)}
                    className="absolute top-2 right-2 p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800/50 transition-colors"
                    aria-label={locale === "ar" ? "حذف" : "Remove"}
                  >
                    ✕
                  </button>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {keywords.length === 0 && !error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-lg border border-dashed border-zinc-700 p-12 text-center space-y-3"
        >
          <Search className="size-12 text-zinc-600 mx-auto" />
          <h3 className="text-lg font-medium text-zinc-400">
            {locale === "ar"
              ? "ابدأ بالتحقق من الكلمات المفتاحية"
              : "Start validating keywords"}
          </h3>
          <p className="text-sm text-zinc-500">
            {locale === "ar"
              ? "أدخل كلمة مفتاحية أعلاه للحصول على درجة الجدوى"
              : "Enter a keyword above to get viability scores"}
          </p>
        </motion.div>
      )}
    </div>
  );
}

export default KeywordValidatorPage;
