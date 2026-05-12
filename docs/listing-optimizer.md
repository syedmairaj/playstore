# AI App Listing Optimizer (Phase 1 MVP)

## Purpose

Single-screen tool that turns structured app inputs into Google Play–oriented listing copy: title, short and long descriptions, ASO keyword ideas, and CTA lines. Aligns with `docs/dashboard-features.md` (AI Listing Optimizer) and `docs/prompts.md` tone (clear, human, non-spammy).

## Architecture (runtime)

1. **Browser** — `app/app/[workspaceId]/optimizer/page.tsx` renders `components/ListingOptimizer.tsx` with a `workspaceId`. The form POSTs JSON to the Next.js route handler (cookies send the user session).
2. **API** — `POST /api/listings/generate` (`app/api/listings/generate/route.ts`):
   - Requires an authenticated Supabase user (`createClient` from `lib/supabase/server.ts`); otherwise **401**.
   - Validates body with Zod (`lib/validation/listing-generate-body.ts`) including **`workspaceId`** plus listing fields from `lib/validation/listing-input.ts`.
   - Verifies workspace membership (`lib/workspace/membership.ts`); otherwise **403**.
   - Resolves client IP from `x-forwarded-for` / `x-real-ip` (`lib/client-ip.ts`) for logging only.
   - **Rate limit** — Supabase RPC `consume_rate_limit` (service role) increments a per-minute bucket keyed by **`listing_generate:<user_id>`** before calling Gemini (`lib/rate-limit.ts`).
   - **Generation** — `@google/generative-ai` calls Gemini with JSON-only output (`lib/gemini/generate-listing.ts`).
   - **Validate model output** — Zod `listingGenerationOutputSchema` enforces Play Store–friendly length caps.
   - **Persist** — Row inserted into `listing_generations` with `workspace_id` and `user_id` using the **user-scoped** Supabase client so **RLS** applies (`lib/db/listing-generations.ts`).
   - **Usage log** — Row inserted into `usage_logs` for success/failure via **service role** (`lib/usage-log.ts`).

3. **Supabase** — User JWT for tenant writes; **service role** only for `consume_rate_limit` + `usage_logs` (never exposed to the browser).

## Prompt flow

- **Versioning** — `getListingOptimizerPromptVersion()` in `lib/prompts/listing-optimizer.ts` (e.g. `listing-optimizer-v1`). Stored on each row for traceability.
- **System instruction** — ASO copywriter role, JSON-only response, field definitions, policy/tone constraints.
- **User content** — App name, category, keywords, features, selected tone/style.
- **Model config** — `responseMimeType: application/json`, moderate temperature (see `lib/gemini/generate-listing.ts`).

## Rate limiting

- **Mechanism** — Table `rate_limit_buckets` keyed by `(key, window_start)` where `window_start` is truncated to the current minute. RPC atomically increments and returns `{ allowed, count }`.
- **Key** — `listing_generate:<user_id>` (authenticated); still enforced via service-role RPC only.
- **Limit** — `RATE_LIMIT_MAX` env (default `10` requests per key per minute). Tune per environment.

## Usage logging

- Each API invocation writes to `usage_logs` with route label, IP, success flag, duration, optional error string, optional JSON `meta` (e.g. persist failure, rate-limit count).

## Schema location

SQL migration: `supabase/migrations/20250511000000_mvp_listing_optimizer.sql`. Apply in Supabase SQL editor or your migration workflow.

## Related docs

- `docs/architecture.md` — stack and principles (MVP narrows to Next + Gemini + Supabase).
- `docs/api.md` — public contract for `POST /api/listings/generate`.
- `docs/database.md` — tables and RPC.
