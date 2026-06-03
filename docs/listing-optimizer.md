# AI Listing Optimizer (Phase 1 MVP)

## Purpose

Single-screen tool that turns structured app inputs into Google Play–oriented listing copy: title, short and long descriptions, ASO keyword ideas, and CTA lines. Aligns with `docs/dashboard-features.md` (AI Listing Optimizer) and `docs/prompts.md` tone (clear, human, non-spammy).

## Architecture (runtime)

1. **Browser** — `app/[locale]/app/[workspaceId]/listing-optimizer/page.tsx` renders `components/ListingOptimizer.tsx` with a `workspaceId`. Legacy `/optimizer` redirects to `/listing-optimizer`. The UI is a **linear three-step wizard** (App Identity → Market Discovery → Final Optimization) with a dual-pane layout (form + sticky live preview) and a results area with tabbed listing fields, skeleton loading on first generate, and a floating action bar when a listing exists. The form POSTs JSON to the Next.js route handler (cookies send the user session).
2. **API**
   - **`POST /api/listings/generate`** (`app/api/listings/generate/route.ts`):
     - Requires an authenticated Supabase user (`createClient` from `lib/supabase/server.ts`); otherwise **401**.
     - Validates body with Zod (`lib/validation/listing-generate-body.ts`) including **`workspaceId`** plus listing fields from `lib/validation/listing-input.ts` (optional **`userInstruction`**: trimmed string, max 2000 chars — appended to the Gemini user prompt for refinements such as “regenerate punchier”).
     - Verifies workspace membership (`lib/workspace/membership.ts`); otherwise **403**.
     - Resolves client IP from `x-forwarded-for` / `x-real-ip` (`lib/client-ip.ts`) for logging only.
     - **Rate limit** — Supabase RPC `consume_rate_limit` (service role) increments a per-minute bucket keyed by **`listing_generate:<user_id>`** before calling Gemini (`lib/rate-limit.ts`).
     - **Generation** — `@google/generative-ai` calls Gemini with JSON-only output (`lib/gemini/generate-listing.ts`). The prompt (`lib/prompts/listing-optimizer.ts`, version e.g. `listing-optimizer-v4`) asks for Play listing fields plus **Certified ASO Score** metadata: `aso_score` (0–100), `score_breakdown` (title 0–30, shortDescription 0–20, longDescription 0–40, persuasiveness 0–10, summing to `aso_score`), and `improvement_tips` (see `lib/validation/listing-output.ts`). The model may return `longDescription` for the long body; the server normalizes to `fullDescription` before clamp/validate.
     - **Validate model output** — Zod `listingGenerationCoreSchema` enforces Play Store–friendly length caps on listing copy (title max **30**, short **80**, long **4000**). ASO scoring is validated separately; if invalid while copy is valid, the response omits ASO fields, sets `asoScoreDegraded` on the saved payload, and **`meta.asoScorePartial`** on the API so the client can show an i18n notice. Before validation, the server **hard-clamps** `title`, `shortDescription`, and `fullDescription` to those max lengths (word-aware when possible for title/short, then ellipsis if still over) so minor model overruns do not fail the request.
     - **Persist** — Row inserted into `listing_generations` with `workspace_id` and `user_id` using the **user-scoped** Supabase client so **RLS** applies (`lib/db/listing-generations.ts`).
     - **Usage log** — Row inserted into `usage_logs` for success/failure via **service role** (`lib/usage-log.ts`).
   - **`POST /api/listings/optimizer-autofill`** (`app/api/listings/optimizer-autofill/route.ts`) — same auth, membership, and **credit debit + refund** pattern as generate; **rate limit** key **`listing_optimizer_autofill:<user_id>`**; calls Gemini for plain text (`lib/gemini/generate-optimizer-autofill.ts`). Does **not** insert `listing_generations` rows.

3. **Supabase** — User JWT for tenant writes; **service role** only for `consume_rate_limit` + `usage_logs` (never exposed to the browser).

## Autofill (Gemini, plain text)

- **Route:** `POST /api/listings/optimizer-autofill` → `lib/gemini/generate-optimizer-autofill.ts`.
- **Credits:** Routes read `workspaces.ai_credits_remaining` (non-mutating) when a debit applies, then call `consume_workspace_ai_credits` **before** Gemini and `refund_workspace_ai_credits` on generation failure so **net wallet change matches a successful model response**. **Costs:** `AI_CREDIT_COSTS.listing_optimizer_autofill` in `lib/features/billing/credit-costs.ts` (**3** credits per autofill request); full listing uses `listing_generation` (**5** credits per run, including regenerate with `userInstruction`).
- **Request `language`:** Optional body field `language`: `"en"` | `"ar"` (default `"en"`). The browser sends the active **next-intl** route locale so Gemini prefers English vs Arabic when the prompt says both are supported.
- **Prompts:** Field-specific **system** instructions (sanitized app name + category interpolated; see `generate-optimizer-autofill.ts` for exact strings). A short **language preference** line is appended from `language`.
  - **keywords (system):** *You are an expert Google Play ASO keyword researcher. Based on App Name: [App Name] and Category: [Category], generate 8-12 high-intent, high-volume, low-competition keywords. Return as comma-separated list. Support English and Arabic if requested.*
  - **features (system):** *You are an expert Google Play conversion copywriter. Based on App Name: [App Name] and Category: [Category], generate 6-8 powerful feature-benefit bullets. Make it compelling and conversion-focused. Support English and Arabic if requested.*
- **Response meta:** Success JSON includes `meta.creditsRemaining` (balance after debit) and `meta.creditsCharged` for the client toast.

## RTL & Arabic (UI)

- **Locale:** `[locale]` in the URL drives `next-intl`. `LocaleAttributes` sets `<html lang>` and `<html dir>` (RTL for `ar`) plus `locale-ar` for global **Noto Sans Arabic** (`app/globals.css` + `next/font` in `app/layout.tsx`).
- **Optimizer subtree:** `components/ListingOptimizer.tsx` (with subcomponents under `components/listing/optimizer/`) wraps the screen in `dir="rtl"` when `locale === "ar"`, applies Tailwind `font-arabic` (Noto + Geist fallback), and passes `previewDir` into `LivePreviewPhone` so in-phone copy mirrors RTL. Prefer logical spacing (`ps`/`ms`, `text-end`, `start`/`end` in Tailwind) in optimizer-related UI.
- **Full listing generate:** The client sends `targetArabic: true` when the route locale is `ar` so `buildListingOptimizerMessages` requests Arabic JSON strings (see `lib/types/listing.ts`).

## Export (Play Console)

- After a successful run, **Export for Play Console** opens a dialog with clamped title, short, and long blocks (per Play limits when the user has typed past caps), numbered paste instructions, per-field copy actions, **Copy all for Play Console** (labeled sections for one-shot paste), and an optional **Download .txt** that bundles the same listing sections plus keyword/CTA suggestions and a machine-readable JSON footer. The client clamps title/short/long before copy/export when fields exceed limits.

## Prompt flow

- **Versioning** — `getListingOptimizerPromptVersion()` in `lib/prompts/listing-optimizer.ts` (e.g. `listing-optimizer-v4`). Stored on each row for traceability.
- **System instruction** — ASO copywriter role, JSON-only response, field definitions, policy/tone constraints.
- **User content** — App name, category, keywords, features, selected tone/style.
- **Model config** — Default model `gemini-2.5-flash` (override `GEMINI_MODEL`); `responseMimeType: application/json` for full generate; shared sampling defaults in `lib/gemini/gemini-defaults.ts` (`temperature` 0.7, `topP` 0.95).

## Rate limiting

- **Mechanism** — Table `rate_limit_buckets` keyed by `(key, window_start)` where `window_start` is truncated to the current minute. RPC atomically increments and returns `{ allowed, count }`.
- **Key** — `listing_generate:<user_id>` for full listing runs; `listing_optimizer_autofill:<user_id>` for per-field autofill (authenticated); still enforced via service-role RPC only.
- **Limit** — `RATE_LIMIT_MAX` env (default `10` requests per key per minute). Tune per environment.

## Usage logging

- Each API invocation writes to `usage_logs` with route label, IP, success flag, duration, optional error string, optional JSON `meta` (e.g. persist failure, rate-limit count).

## Schema location

SQL migration: `supabase/migrations/20250511000000_mvp_listing_optimizer.sql`. Apply in Supabase SQL editor or your migration workflow.

## Related docs

- `docs/architecture.md` — stack and principles (MVP narrows to Next + Gemini + Supabase).
- `docs/api.md` — public contract for `POST /api/listings/generate` and `POST /api/listings/optimizer-autofill`.
- `docs/database.md` — tables and RPC.
