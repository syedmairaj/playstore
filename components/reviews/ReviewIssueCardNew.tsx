"use client";

import { useState, useRef, useEffect } from "react";
import { Copy, Edit2, Save, X, Zap } from "lucide-react";
import { BrandKitImage, BrandKitImageGrid } from "@/components/brand-kit/BrandKitImage";
import {
  extractBrandKit,
  getScreenshotsForLanguage,
  getBannerForLanguage,
} from "@/lib/brand-kit/asset-selector";
import { isRTLLanguage } from "@/lib/localization/rtl";

/**
 * ReviewIssueCard Component
 *
 * Individual review item with AI response generation
 *
 * Features:
 * - Display review content with metadata
 * - Generate AI responses with tone selection
 * - Edit and save responses
 * - Copy to clipboard
 * - Brand kit integration (icon, banners, screenshots)
 * - Full RTL/LTR support
 *
 * Data Flow:
 * Review → AI Generation → Optimistic Update → Save
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

interface ReviewIssueCardProps {
  item: ActiveItem;
  response?: ReviewResponse;
  isGenerating: boolean;
  tone: ToneType;
  onGenerateResponse: (item: ActiveItem, tone: ToneType) => Promise<void>;
  onSaveResponse: (itemId: string) => Promise<void>;
  onCopyResponse: (itemId: string) => void;
  onEditResponse: (itemId: string, newText: string) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/10 text-red-300 border-red-500/30",
  high: "bg-orange-500/10 text-orange-300 border-orange-500/30",
  medium: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30",
  low: "bg-blue-500/10 text-blue-300 border-blue-500/30",
};

export function ReviewIssueCardNew({
  item,
  response,
  isGenerating,
  tone,
  onGenerateResponse,
  onSaveResponse,
  onCopyResponse,
  onEditResponse,
}: ReviewIssueCardProps) {
  // ── State ──────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(response?.response || "");
  const [isSaving, setIsSaving] = useState(false);
  const [showBrandKit, setShowBrandKit] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Localization ───────────────────────────────────────────────────────
  const isArabic = isRTLLanguage(item.language);

  // ── Brand Kit ──────────────────────────────────────────────────────────
  const brandKit = extractBrandKit(item.metadata);
  const screenshots = getScreenshotsForLanguage(brandKit, item.language);
  const banner = getBannerForLanguage(brandKit, item.language);

  // ── Effects ────────────────────────────────────────────────────────────
  // Focus edit input when entering edit mode
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  // Update edit text when response changes
  useEffect(() => {
    if (response?.response && !isEditing) {
      setEditText(response.response);
    }
  }, [response?.response, isEditing]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleGenerateResponse = async () => {
    await onGenerateResponse(item, tone);
  };

  const handleSaveResponse = async () => {
    setIsSaving(true);
    try {
      if (isEditing && editText) {
        onEditResponse(item.id, editText);
      }
      await onSaveResponse(item.id);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditText(response?.response || "");
    setIsEditing(false);
  };

  const handleCopy = () => {
    onCopyResponse(item.id);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
  };

  // ── Character count for app store limit ────────────────────────────────
  const charCount = response?.response?.length || 0;
  const charLimit = 280;
  const isOverLimit = charCount > charLimit;

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition">
      {/* ── Banner (Optional) ─────────────────────────────────────────────── */}
      {banner && showBrandKit && (
        <div className="h-32 overflow-hidden bg-gradient-to-br from-zinc-900 to-black">
          <BrandKitImage
            src={banner}
            alt="App Banner"
            width={800}
            height={128}
            className="w-full h-full"
          />
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* ── Review Header ─────────────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Metadata Badges */}
          <div className="flex gap-2 flex-wrap items-center">
            {/* Severity Badge */}
            {item.metadata?.severity && (
              <span
                className={`text-xs font-medium px-2 py-1 rounded border ${
                  SEVERITY_COLORS[item.metadata.severity] ||
                  SEVERITY_COLORS.medium
                }`}
              >
                {item.metadata.severity.charAt(0).toUpperCase() +
                  item.metadata.severity.slice(1)}
              </span>
            )}

            {/* Impact Badge */}
            {item.metadata?.impactPercent && (
              <span className="text-xs font-medium px-2 py-1 rounded border border-purple-500/30 bg-purple-500/10 text-purple-300">
                {item.metadata.impactPercent}% Impact
              </span>
            )}

            {/* Language Badge */}
            <span className="text-xs font-medium px-2 py-1 rounded border border-zinc-600 bg-zinc-800 text-zinc-300">
              {item.language?.toUpperCase()}
            </span>

            {/* Brand Kit Indicator */}
            {brandKit && (
              <button
                onClick={() => setShowBrandKit(!showBrandKit)}
                className="text-xs font-medium px-2 py-1 rounded border border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/15 transition"
              >
                {showBrandKit ? "Hide" : "Show"} Brand Kit
              </button>
            )}
          </div>

          {/* Review Content */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white leading-relaxed">
              {item.content}
            </h3>

            {item.metadata?.description && (
              <p className="text-sm text-zinc-400 leading-relaxed">
                {item.metadata.description}
              </p>
            )}

            {item.metadata?.topQuote && (
              <blockquote className="pl-4 border-l-2 border-zinc-700 text-sm text-zinc-300 italic">
                "{item.metadata.topQuote}"
              </blockquote>
            )}
          </div>
        </div>

        {/* ── Brand Kit Section (Optional) ────────────────────────────────── */}
        {brandKit && showBrandKit && (
          <div className="pt-4 border-t border-zinc-800 space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-zinc-300">
                App Branding
              </h4>

              {/* Icon */}
              {brandKit.app_icon && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">Icon:</span>
                  <BrandKitImage
                    src={brandKit.app_icon}
                    alt="App Icon"
                    width={64}
                    height={64}
                    className="w-16 h-16"
                  />
                </div>
              )}

              {/* Screenshots Grid */}
              {screenshots.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs text-zinc-500">
                    Screenshots ({item.language?.toUpperCase()}):
                  </span>
                  <BrandKitImageGrid
                    images={screenshots.slice(0, 3)}
                    columns={3}
                    gap="sm"
                    imageHeight={150}
                    alt="App Screenshot"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── AI Response Section ───────────────────────────────────────────── */}
        <div className="pt-6 border-t border-zinc-800 space-y-4">
          {!response ? (
            // No response yet - show generate button
            <button
              onClick={handleGenerateResponse}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-zinc-700 disabled:to-zinc-700 text-white font-medium transition text-sm"
            >
              <Zap className="w-4 h-4" />
              {isGenerating ? "Generating..." : "Generate AI Response"}
            </button>
          ) : (
            // Response exists - show response box
            <div className="space-y-3">
              {isEditing ? (
                // Edit mode
                <div className="space-y-3">
                  <textarea
                    ref={editInputRef}
                    value={editText}
                    onChange={handleEditChange}
                    className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 focus:border-blue-500 text-white text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-500/30 resize-none"
                    rows={4}
                    placeholder="Edit your response..."
                  />

                  {/* Character Count */}
                  <div
                    className={`text-xs ${
                      isOverLimit ? "text-red-400" : "text-zinc-500"
                    }`}
                  >
                    {charCount}/{charLimit} characters
                    {isOverLimit && " (exceeds app store limit)"}
                  </div>

                  {/* Edit Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveResponse}
                      disabled={isSaving || !editText}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 text-white font-medium transition text-sm"
                    >
                      <Save className="w-4 h-4" />
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={handleCancel}
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-medium transition text-sm"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <>
                  {/* Response Content */}
                  <div className="px-4 py-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                    <p className="text-sm text-zinc-200 leading-relaxed">
                      {response.response}
                    </p>
                  </div>

                  {/* Character Count */}
                  <div
                    className={`text-xs ${
                      isOverLimit ? "text-red-400" : "text-zinc-500"
                    }`}
                  >
                    {charCount}/{charLimit} characters
                    {isOverLimit && " (exceeds app store limit)"}
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    {response.isSaved && (
                      <span className="text-xs font-medium px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                        ✓ Saved
                      </span>
                    )}
                    <span className="text-xs text-zinc-500">
                      Tone: {response.tone}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-medium transition text-sm"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-medium transition text-sm"
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>
                    {!response.isSaved && (
                      <button
                        onClick={handleSaveResponse}
                        disabled={isSaving}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 text-white font-medium transition text-sm"
                      >
                        <Save className="w-4 h-4" />
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Regenerate Button */}
              {!isEditing && (
                <button
                  onClick={handleGenerateResponse}
                  disabled={isGenerating}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-zinc-700 hover:bg-zinc-900 disabled:bg-zinc-800 text-zinc-300 font-medium transition text-sm"
                >
                  <Zap className="w-4 h-4" />
                  {isGenerating ? "Regenerating..." : "Regenerate"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Metadata Footer ───────────────────────────────────────────────── */}
        <div className="pt-4 border-t border-zinc-800 flex justify-between items-center text-xs text-zinc-500">
          <span>
            {new Date(item.stagedAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          <span>{item.source}</span>
        </div>
      </div>
    </div>
  );
}
