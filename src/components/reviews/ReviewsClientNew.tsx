"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ReviewIssueCardNew } from "./ReviewIssueCardNew";
import { isRTLLanguage } from "@/lib/localization/rtl";

/**
 * ReviewsClient Component
 *
 * Main interface for the AI-Powered Review Response Module
 *
 * Features:
 * - Fetches review issues from optimizer context via SWR
 * - Optimistic UI updates for AI responses
 * - Tone-aware AI response generation
 * - Full RTL/LTR localization support
 * - Brand kit integration
 *
 * Data Flow:
 * 1. Fetch from /api/workspaces/[id]/optimizer/context
 * 2. User clicks "Generate AI Response"
 * 3. Optimistic update: show response immediately
 * 4. Send to LLM API with language & tone context
 * 5. Server update with actual response
 */

interface ActiveItem {
  id: string;
  signalType: string;
  content: string;
  source: string;
  sourceAppId?: string;
  language: string;
  stagedAt: string;
  metadata?: {
    description?: string;
    severity?: string;
    impactPercent?: number;
    topQuote?: string;
    brand_kit?: any;
  };
}

interface ReviewResponse {
  itemId: string;
  tone: "professional" | "empathetic" | "concise";
  response: string;
  timestamp: string;
  isSaved: boolean;
  isAIGenerated: boolean;
}

type ToneType = "professional" | "empathetic" | "concise";

const TONE_DESCRIPTIONS: Record<ToneType, string> = {
  professional: "Formal and solution-focused",
  empathetic: "Understanding and supportive",
  concise: "Brief and direct",
};

export function ReviewsClient({ workspaceId }: { workspaceId: string }) {
  // ── State Management ───────────────────────────────────────────────────
  const [responses, setResponses] = useState<Map<string, ReviewResponse>>(
    new Map()
  );
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [selectedTone, setSelectedTone] = useState<ToneType>("professional");
  const [activeLanguageFilter, setActiveLanguageFilter] = useState<string | null>(
    null
  );

  // ── Data Fetching with SWR ─────────────────────────────────────────────
  const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.statusText}`);
    }
    return res.json();
  };

  const { data, error, isLoading, mutate } = useSWR(
    `/api/workspaces/${workspaceId}/optimizer/context`,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 60000, // 1 minute
    }
  );

  const activeItems: ActiveItem[] = useMemo(() => {
    if (!data?.activeItems) return [];
    return data.activeItems.filter(
      (item: ActiveItem) =>
        !activeLanguageFilter || item.language === activeLanguageFilter
    );
  }, [data?.activeItems, activeLanguageFilter]);

  const uniqueLanguages = useMemo(() => {
    if (!data?.activeItems) return [];
    const langs = new Set<string>();
    data.activeItems.forEach((item: ActiveItem) => {
      langs.add(item.language || "en");
    });
    return Array.from(langs).sort();
  }, [data?.activeItems]);

  // ── AI Response Generation ─────────────────────────────────────────────
  const generateAIResponse = useCallback(
    async (item: ActiveItem, tone: ToneType) => {
      const itemId = item.id;

      // Set loading state
      setGeneratingIds((prev) => new Set(prev).add(itemId));

      // Optimistic update
      const optimisticResponse: ReviewResponse = {
        itemId,
        tone,
        response: "✨ Generating response...",
        timestamp: new Date().toISOString(),
        isSaved: false,
        isAIGenerated: true,
      };
      setResponses((prev) => new Map(prev).set(itemId, optimisticResponse));

      try {
        // ✅ KEY: Include language context in prompt
        const isArabic = item.language?.startsWith("ar");
        const languageContext = isArabic
          ? "Generate the response in Arabic with proper RTL formatting."
          : "Generate the response in English.";

        const prompt = `
You are a professional app support specialist responding to a user review.

Review: "${item.content}"
${item.metadata?.topQuote ? `Quote: "${item.metadata.topQuote}"` : ""}
${item.metadata?.description ? `Context: ${item.metadata.description}` : ""}
Severity: ${item.metadata?.severity || "medium"}

Tone: ${TONE_DESCRIPTIONS[tone]}
${languageContext}

Requirements:
- Keep response under 280 characters (fits in app store)
- Be human-like, not robotic
- Address the specific issue mentioned
- Show understanding of their concern
- Offer next steps if applicable
- No generic "thank you" openers

Respond with ONLY the message, no additional text or quotes.
`;

        const response = await fetch("/api/ai/generate-response", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            workspaceId,
            itemId,
            tone,
            language: item.language,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate response");
        }

        const { response: aiResponse } = await response.json();

        // Update with actual response
        setResponses((prev) =>
          new Map(prev).set(itemId, {
            itemId,
            tone,
            response: aiResponse,
            timestamp: new Date().toISOString(),
            isSaved: false,
            isAIGenerated: true,
          })
        );

        toast.success("Response generated! ✨");
      } catch (err) {
        console.error("Failed to generate response:", err);
        toast.error("Failed to generate response");

        // Remove optimistic update on error
        setResponses((prev) => {
          const next = new Map(prev);
          next.delete(itemId);
          return next;
        });
      } finally {
        setGeneratingIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    },
    [workspaceId]
  );

  // ── Save Response to Staging Vault ────────────────────────────────────
  const saveResponse = useCallback(
    async (itemId: string) => {
      const response = responses.get(itemId);
      if (!response) return;

      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/reviews/response/save`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              itemId,
              response: response.response,
              tone: response.tone,
              language: data?.activeItems.find((i: ActiveItem) => i.id === itemId)
                ?.language,
            }),
          }
        );

        if (!res.ok) throw new Error("Failed to save response");

        // Update response as saved
        setResponses((prev) => {
          const updated = new Map(prev);
          const resp = updated.get(itemId);
          if (resp) {
            resp.isSaved = true;
          }
          return updated;
        });

        toast.success("Response saved! 📝");
      } catch (err) {
        console.error("Failed to save response:", err);
        toast.error("Failed to save response");
      }
    },
    [workspaceId, responses, data?.activeItems]
  );

  // ── Copy to Clipboard ────────────────────────────────────────────────
  const copyToClipboard = useCallback((itemId: string) => {
    const response = responses.get(itemId);
    if (!response) return;

    navigator.clipboard.writeText(response.response);
    toast.success("Copied to clipboard! 📋");
  }, [responses]);

  // ── Edit Response ────────────────────────────────────────────────────
  const editResponse = useCallback(
    (itemId: string, newText: string) => {
      setResponses((prev) => {
        const updated = new Map(prev);
        const resp = updated.get(itemId);
        if (resp) {
          resp.response = newText;
          resp.isSaved = false; // Mark as unsaved after edit
        }
        return updated;
      });
    },
    []
  );

  // ── UI State ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center h-96 px-4">
        <div className="text-center space-y-4">
          <div className="text-4xl">⚠️</div>
          <h3 className="text-lg font-semibold text-white">
            Failed to load reviews
          </h3>
          <p className="text-sm text-zinc-400">{error.message}</p>
          <button
            onClick={() => mutate()}
            className="px-4 py-2 rounded-lg bg-blue-500/10 text-blue-300 text-sm font-medium hover:bg-blue-500/15 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="space-y-3 text-center">
          <div className="inline-block animate-spin">⚙️</div>
          <p className="text-sm text-zinc-400">Loading reviews...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-white">Review Responses</h1>
        <p className="text-sm text-zinc-400">
          Generate and manage AI-powered responses to user reviews
        </p>
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Tone Selector */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-300">Tone</label>
          <div className="flex gap-2 flex-wrap">
            {(["professional", "empathetic", "concise"] as ToneType[]).map(
              (tone) => (
                <button
                  key={tone}
                  onClick={() => setSelectedTone(tone)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition ${
                    selectedTone === tone
                      ? "bg-blue-500/20 border border-blue-500 text-blue-300"
                      : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700"
                  }`}
                  title={TONE_DESCRIPTIONS[tone]}
                >
                  {tone.charAt(0).toUpperCase() + tone.slice(1)}
                </button>
              )
            )}
          </div>
        </div>

        {/* Language Filter */}
        {uniqueLanguages.length > 1 && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">Language</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setActiveLanguageFilter(null)}
                className={`px-3 py-1.5 text-sm rounded-lg transition ${
                  activeLanguageFilter === null
                    ? "bg-emerald-500/20 border border-emerald-500 text-emerald-300"
                    : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                All
              </button>
              {uniqueLanguages.map((lang) => (
                <button
                  key={lang}
                  onClick={() => setActiveLanguageFilter(lang)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition ${
                    activeLanguageFilter === lang
                      ? "bg-emerald-500/20 border border-emerald-500 text-emerald-300"
                      : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Empty State ───────────────────────────────────────────────────── */}
      {activeItems.length === 0 && (
        <div className="flex items-center justify-center py-16 px-4 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50">
          <div className="text-center space-y-3">
            <div className="text-4xl">📭</div>
            <h3 className="font-medium text-white">No reviews found</h3>
            <p className="text-sm text-zinc-400">
              {activeLanguageFilter
                ? `No reviews in ${activeLanguageFilter.toUpperCase()}`
                : "Stage reviews to get started"}
            </p>
          </div>
        </div>
      )}

      {/* ── Issues Grid ───────────────────────────────────────────────────── */}
      <div className="grid gap-6">
        {activeItems.map((item) => {
          const isArabic = isRTLLanguage(item.language);
          const response = responses.get(item.id);
          const isGenerating = generatingIds.has(item.id);

          return (
            <div key={item.id} dir={isArabic ? "rtl" : "ltr"}>
              <ReviewIssueCardNew
                item={item}
                response={response}
                isGenerating={isGenerating}
                tone={selectedTone}
                onGenerateResponse={generateAIResponse}
                onSaveResponse={saveResponse}
                onCopyResponse={copyToClipboard}
                onEditResponse={editResponse}
              />
            </div>
          );
        })}
      </div>

      {/* ── Stats Footer ──────────────────────────────────────────────────── */}
      {activeItems.length > 0 && (
        <div className="mt-12 pt-8 border-t border-zinc-800 flex justify-between text-xs text-zinc-500">
          <div>
            <span className="font-medium text-zinc-300">{activeItems.length}</span>{" "}
            review{activeItems.length !== 1 ? "s" : ""} staged
          </div>
          <div>
            <span className="font-medium text-zinc-300">
              {Array.from(responses.values()).filter((r) => r.isSaved).length}
            </span>{" "}
            response{
              Array.from(responses.values()).filter((r) => r.isSaved).length !==
              1
                ? "s"
                : ""
            }{" "}
            saved
          </div>
        </div>
      )}
    </div>
  );
}
