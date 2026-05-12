# Agent and developer guidelines

The **`docs/`** directory is the **source of truth** for this project—product, design, architecture, APIs, data, and workflows. For the **five core UI surfaces** (home, pricing, onboarding, dashboard home, settings), **`app-pages/`** is the canonical spec; keep `docs/` summaries aligned (see `docs/core-pages.md`).

- **Review docs first** — AI agents and developers should read the relevant files under `docs/` before making changes.
- **Docs over code** — If code conflicts with `docs/`, follow the documentation unless `docs/` has been **intentionally** updated first to match the new direction.
- **Docs before big shifts** — Major architecture, database schema, API, or workflow changes should be reflected in `docs/` before (or alongside) implementation, not left undocumented.
- **Stay consistent** — Prefer the existing project structure and conventions over new patterns unless documentation or an explicit decision says otherwise.

For detailed enforcement rules for Cursor and similar agents, see [`.cursor/rules/docs-source-of-truth.mdc`](.cursor/rules/docs-source-of-truth.mdc).
