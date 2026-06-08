import type { ReviewClassification } from "@/components/reviews/reviews-types";

export const REVIEW_IMPROVEMENTS_QUEUE_STORAGE = "playstore_review_improvements_queue";

const SENTIMENT_BY_CLASSIFICATION: Record<ReviewClassification, string> = {
  bug_crash: "Bug / Crash",
  feature_request: "Feature Request",
  pricing: "Pricing Concern",
  praise: "User Praise",
};

export function sentimentTagFromClassifications(
  classifications: ReviewClassification[],
): string {
  const first = classifications[0];
  if (!first) return "Competitor Weakness";
  return SENTIMENT_BY_CLASSIFICATION[first] ?? "Competitor Weakness";
}

export type ListingImprovementItem = {
  id: string;
  reviewId: string;
  reviewText: string;
  userName: string;
  score: number;
  sentimentTag: string;
  appId: string | null;
  packageName: string | null;
  isUtilized: boolean;
  createdAt: string;
};

async function fetchListingImprovementsResponse(workspaceId: string): Promise<ListingImprovementItem[]> {
  const res = await fetch(
    `/api/workspaces/${workspaceId}/listing-improvements?unutilized=1`,
    { credentials: "same-origin" },
  );
  const json = (await res.json()) as {
    ok?: boolean;
    items?: ListingImprovementItem[];
  };
  if (!res.ok || !json.ok || !Array.isArray(json.items)) return [];
  return json.items.filter(
    (item): item is ListingImprovementItem =>
      typeof item === "object" &&
      item !== null &&
      typeof item.id === "string" &&
      typeof item.reviewId === "string" &&
      typeof item.reviewText === "string",
  );
}

export async function fetchUnutilizedListingImprovements(
  workspaceId: string,
): Promise<ListingImprovementItem[]> {
  return fetchListingImprovementsResponse(workspaceId);
}

export async function fetchListingImprovementReviewIds(
  workspaceId: string,
): Promise<string[]> {
  const items = await fetchListingImprovementsResponse(workspaceId);
  return items
    .map((item) => item.reviewId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

export type ReviewImprovementQueueEntry = {
  reviewId: string;
  text: string;
  classifications: ReviewClassification[];
  addedAt: string;
};

export function readReviewImprovementsQueue(): ReviewImprovementQueueEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(REVIEW_IMPROVEMENTS_QUEUE_STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ReviewImprovementQueueEntry =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ReviewImprovementQueueEntry).reviewId === "string" &&
        typeof (item as ReviewImprovementQueueEntry).text === "string" &&
        Array.isArray((item as ReviewImprovementQueueEntry).classifications),
    );
  } catch {
    return [];
  }
}

export function isReviewInImprovementsQueue(reviewId: string): boolean {
  return readReviewImprovementsQueue().some((e) => e.reviewId === reviewId);
}

export function appendReviewToImprovementsQueue(entry: ReviewImprovementQueueEntry): void {
  if (typeof window === "undefined") return;
  const existing = readReviewImprovementsQueue();
  if (existing.some((e) => e.reviewId === entry.reviewId)) return;
  try {
    localStorage.setItem(
      REVIEW_IMPROVEMENTS_QUEUE_STORAGE,
      JSON.stringify([...existing, entry]),
    );
  } catch {
    /* quota / private mode */
  }
}

/** @deprecated Review themes must not be merged into Target Keywords; use the listing-improvements queue API instead. */
export function buildOptimizerPrefillFromReview(
  text: string,
  classifications: ReviewClassification[],
): string {
  const classTerms = classifications.join(", ");
  const snippet = text.trim().replace(/\s+/g, " ").slice(0, 120);
  return [classTerms, snippet].filter(Boolean).join(", ");
}

/** One-time Gemini directive from queued listing improvements (not search keywords). */
export function buildListingImprovementsGenerateDirective(
  items: ListingImprovementItem[],
): string {
  if (!items.length) return "";
  const themes = items.map((item) => {
    const tag = item.sentimentTag?.trim() || "User feedback";
    const snippet = item.reviewText.trim().replace(/\s+/g, " ").slice(0, 160);
    return snippet ? `${tag}: ${snippet}` : tag;
  });
  return [
    "The following user review themes are queued for this optimization run.",
    "Weave them into positive, high-converting storefront copy.",
    "Do NOT paste them verbatim as search keywords or in the app title.",
    `Queued themes: ${themes.join(" | ")}`,
  ].join(" ");
}

export function draftReplySessionKey(reviewId: string): string {
  return `playstore_review_draft_${reviewId}`;
}
