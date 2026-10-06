# G3-reconcile-docs Documentation & Manifest Reconciliation
Status: done
Changed:
- `MANIFEST.md`
- `share/MANIFEST.md`
- `scripts/generate-manifest.js`
- `docs/DOMAIN_AND_PERSISTENCE_AUDIT.md`
- `ANTIGRAVITY_PROMPTS.md`
- `docs/handoffs/G3-reconcile-docs.md`

Added deps: none

Public API:
- Script: `node scripts/generate-manifest.js` (reproducibly recalculates file counts, LOC, test counts, binary statistics, and regenerates `MANIFEST.md` and `share/MANIFEST.md`)

Tests:
- Verified `node scripts/generate-manifest.js` runs cleanly in < 1 second.
- Verified all counts in `MANIFEST.md` match real codebase filesystem queries:
  - 336 source files, 77,523 LOC across core crates and UI.
  - 311+ Rust unit/integration tests and 506 UI Vitest tests passing.
- Updated `docs/DOMAIN_AND_PERSISTENCE_AUDIT.md` to reflect completed SQLite/WAL migration and active setlist startup hydration.
- Marked all 24 original prompts across Wave 0, Wave 1, and Wave 2 as DONE in `ANTIGRAVITY_PROMPTS.md` with direct links to handoff notes.

Known gaps: none.

Needs from others: none.
