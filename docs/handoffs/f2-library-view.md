# F2 Library View: Virtualized Table, Filtering, and Harmonic Mixing
Status: done
Changed:
- ui/package.json
- pnpm-lock.yaml
- ui/src/features/library/types.ts
- ui/src/features/library/harmonic.ts
- ui/src/features/library/filters.ts
- ui/src/features/library/sorting.ts
- ui/src/features/library/mock5000.ts
- ui/src/features/library/LibraryView.tsx
- ui/src/features/library/index.ts
- ui/src/features/library/pure.test.ts
- ui/src/features/library/LibraryView.test.tsx
- ui/src/components/routes/LibraryRoute.tsx
- docs/handoffs/011-ui-library-view.md
- docs/handoffs/f2-library-view.md

Added deps:
- `@tanstack/react-table` (^8.21.3): Headless table core for column sorting, selection, and pagination/filtering.
- `@tanstack/react-virtual` (^3.14.13): Virtualizer for rendering large track collections (e.g. 5,000+ tracks) at 60fps.

Public API:
- `ui/src/features/library`:
  - `export function LibraryView(): JSX.Element`: Main virtualized track library component.
  - `export function filterTracks(tracks: Track[], filters: LibraryFilters): Track[]`: Pure function filtering by search query, BPM range, Camelot key, harmonic compatibility, and energy range.
  - `export function sortTracks(tracks: Track[], field: SortField, direction: SortDirection): Track[]`: Pure function sorting by title, artist, BPM, Camelot harmonic order, energy, LUFS, or duration.
  - `export function getCompatibleCamelotKeys(key: string, includeAdjacentRelatives?: boolean): string[]`: Pure function returning exact match, relative mode, and adjacent fifths (clockwise/counter-clockwise on the Camelot wheel).
  - `export function isHarmonicallyCompatible(keyA: string, keyB: string, includeAdjacentRelatives?: boolean): boolean`: Checks if two Camelot keys are harmonically mixable.
  - `export function parseCamelotKey(key: string): { number: number; letter: 'A' | 'B' } | null`
  - `export function getCamelotDistance(keyA: string, keyB: string): number | null`: Circular distance 0..6 on the Camelot wheel.
  - `export function generateMockTracks(count?: number): Track[]`: High-performance deterministic generator for 5,000 realistic tracks.
  - `export type LibraryFilters`, `export type SortField`, `export type SortDirection`, `export const DEFAULT_FILTERS`.

Tests:
- `ui/src/features/library/pure.test.ts` (21 tests):
  - Valid and invalid Camelot key string parsing.
  - Neighbor extraction for 8A (8A, 8B, 7A, 9A, 7B, 9B) and exclusion of dissonant tritone/distant keys.
  - Circular wrap-around boundaries (1A <-> 12A, 12B <-> 1B).
  - Harmonic compatibility evaluation and circular distance calculations.
  - Track filtering by search query across title, artist, album, and key.
  - Track filtering by BPM range, exact Camelot key, harmonically compatible Camelot keys, and energy score range.
  - Combined multi-criteria filter execution.
  - Track sorting across all columns (title, artist, BPM, key in harmonic 1A..12B order, energy, LUFS, duration).
  - Immutability verification of pure sort function.
  - 5,000 track generation performance (< 500ms) and multi-filter/sort benchmark on 5,000 items (< 50ms).
- `ui/src/features/library/LibraryView.test.tsx` (6 tests):
  - Table headers, columns, and accessibility attributes.
  - Row click interaction opening Track route with selected track in store.
  - Multi-select checkbox interactions and batch "+ Add to Setlist" execution.
  - Search filter input reactivity.
  - 5,000 mock track benchmark mode toggle.
  - Background scanning progress bar rendering.

Known gaps:
- Virtual table drag-and-drop directly into the sidebar setlist (dnd-kit integration arrives in F4).
- Inline audio preview is out of scope for v1 per AGENTS.md section 8.

Needs from others:
- Workgroup Integration (G1/G2) to stream native Rust scanner progress into the UI event subscriber.
