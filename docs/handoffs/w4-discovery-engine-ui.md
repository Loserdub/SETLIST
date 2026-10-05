# w4-discovery-engine-ui Musical Relationship Topology & Discovery Engine

Status: done
Changed:
- `ui/src/features/discovery/musicalTopology.ts` (new)
- `ui/src/features/discovery/MusicalTopologyCanvas.tsx` (new)
- `ui/src/features/discovery/MusicalRelationshipInspector.tsx` (new)
- `ui/src/features/discovery/MusicalTopologyView.tsx` (new)
- `ui/src/features/discovery/MusicalTopologyView.test.tsx` (new)
- `ui/src/features/discovery/types.ts`
- `ui/src/features/discovery/index.ts`
- `ui/src/features/discovery/CatalogExplorerView.tsx`

Added deps: none (pure SVG, React, TypeScript, Tailwind, Zustand)

Public API:
- `MusicalTopologyView`: Main discovery cockpit answering "Where can this track go?"
- `MusicalTopologyCanvas`: Restrained SVG radial constellation and orbit topology
- `MusicalRelationshipInspector`: Grounded dimensional inspector explaining WHY candidates relate across KEY, TEMPO, ENERGY, and ROLE shifts
- `determineSongRole(song: Song): SongMusicalRole`: Evaluator for OPENER, BUILD, PEAK, BRIDGE, CLOSER, JOURNEY
- `categorizeRelationships(...)`: Facet filter grouping for 8 relationship dimensions (harmonic, tempo, energy, style, openers, peaks, bridges, closers)
- `computeTopologyPositions(...)`: Concentric orbital positioner mapped by Camelot wheel angles and musical distance

Tests:
- `ui/src/features/discovery/MusicalTopologyView.test.tsx`: 8 tests covering:
  - Header inquiry "WHERE CAN THIS TRACK GO?" and focal track profile
  - 8 musical relationship facet filter pills with live counter badges
  - SVG topology canvas with concentric orbits (Inner: High Consonance, Middle: Lifts, Outer: Bridges/Closers)
  - Inspecting candidate track explaining WHY it relates with comparative HUD cards:
    - KEY (e.g. 8A -> 9A)
    - TEMPO (e.g. 124 -> 125)
    - ENERGY (e.g. 5 -> 7)
    - ROLE (e.g. BUILD -> PEAK)
  - Topology hopping ("Explore Where THIS Track Can Go")
  - Setlist persistence from candidate inspector
  - Canvas vs. Cards display toggles
  - Seamless integration into `CatalogExplorerView`
- Test suite results:
  - 17/17 tests passing in `ui/src/features/discovery`
  - 431/431 total UI vitest tests passing across 35 test files
  - 294/294 total Rust tests passing across the workspace
  - `cargo clippy --workspace -- -D warnings`: clean (0 warnings)
  - `cargo fmt --check`: clean (0 diffs)

Known gaps:
- Pre-existing typecheck errors in `LibraryView.tsx` belong to Workgroup F (not Workgroup W).

Needs from others:
- None.
