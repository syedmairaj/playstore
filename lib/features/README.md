# `lib/features` — launch architecture

## Layers

1. **`flags/`** — Boolean toggles: Supabase `feature_flags` + `NEXT_PUBLIC_FF_<KEY>` env overrides (`resolve.ts`). Server entry: `getFeatureFlags(supabase)`.
2. **`core/`** — Platform: workspaces, plans, pricing exports (barrel re-exports today; migrate files here gradually).
3. **`product/`** — ASO surfaces: keyword tracker, listing AI, competitors, reviews, alerts. Add `product/<module>/` per new launch (e.g. `product/ranking-tracker/`).

## Adding a module (e.g. Ranking Tracker)

1. Add a row to `feature_flags` (migration) + default in `flags/defaults.ts`.
2. Create `lib/features/product/ranking-tracker/` (types, server loaders, API helpers).
3. Create `components/features/ranking-tracker/` for shared UI.
4. Add route `app/[locale]/app/[workspaceId]/ranking/` (or extend keywords) and gate nav with `getFeatureFlags`.

## Monitoring

- Optional **Sentry**: set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (see `.env.example`).
- **Vercel**: server `console.error` / route failures already appear in project logs.
