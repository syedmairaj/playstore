# App page specifications (source of truth)

These Markdown files define **exact copy, structure, and UX** for the five core public and app surfaces. Implementations in `app/` should match them; when product changes, update **here first**, then align code and `docs/`.

| File | Route |
|------|--------|
| `home.md` | `/` |
| `pricing.md` | `/pricing` |
| `onboarding.md` | `/onboarding` |
| `dashboard-home.md` | `/app/[workspaceId]` |
| `settings.md` | `/app/[workspaceId]/settings` |

Related: `docs/design-system.md`, `docs/architecture.md`, `docs/database.md`.
