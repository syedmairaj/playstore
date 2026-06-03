# Product features (Phase 1+)

Each vertical owns **domain logic** here and **UI** under `components/features/<area>/`.

| Area | Logic | UI |
|------|--------|-----|
| ASO / home | `product/aso/` | `components/features/aso/` |
| Keywords (tracker) | `lib/keywords/` (legacy path; new code → `product/keywords/`) | `app/.../keywords/` |
| Listing AI | `lib/gemini`, `lib/prompts` | `app/.../listing-optimizer/` |
| Competitors | TBD `product/competitors/` | `app/.../competitors/` |
| Reviews | TBD `product/reviews/` | `app/.../reviews/` |
| Alerts | `lib/keywords/evaluate-alerts.ts` (legacy) | `app/.../alerts/` |

**Coming soon:** `ranking_tracker_advanced`, `alerts_advanced`, `localization_playbook` — see `feature_flags` + `lib/features/flags/`.
