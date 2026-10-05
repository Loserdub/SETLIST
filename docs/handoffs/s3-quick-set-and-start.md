# s3-quick-set-and-start Start route wiring, Quick Set modal, and simpler My Set top bar
Status: done
Changed:
- `ui/src/store/useAppStore.ts`
- `ui/src/App.tsx`
- `ui/src/components/Sidebar.tsx`
- `ui/src/features/start/StartScreen.tsx`
- `ui/src/features/setlist/SetlistView.tsx`
- `ui/src/features/setlist/SetlistView.test.tsx`
- `ui/src/features/setlist/QuickSetModal.tsx`
- `ui/src/features/setlist/quickSet.test.tsx`
- `ui/src/features/start/landingRoute.test.tsx`
- `ui/src/features/setlist/index.ts`
- `docs/handoffs/s3-quick-set-and-start.md`

Added deps: none

Public API:
- `Route`: Added `'start'` to route union type in `ui/src/store/useAppStore.ts` (`export type Route = 'start' | 'library' | 'discovery' | 'track' | 'setlist' | 'settings' | 'stage';`).
- `QuickSetModal`: Exported component from `ui/src/features/setlist/` with props `QuickSetModalProps`:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `selectedTracks?: Track[]` (falls back to selected store tracks or all loaded tracks up to 40)
  - `customBackend?: Backend` (supports dependency injection for testing and mock environments)
- Landing Route logic: Resolved on startup in `ui/src/App.tsx`. Automatically navigates to `'start'` when the library is empty, or `'library'` (My Music) when tracks exist. Does not use `localStorage`.

Features implemented:
1. **Start Route & Navigation**:
   - Added `'start'` route to `useAppStore.ts`.
   - Wired `StartScreen` inside `ui/src/App.tsx` with `onOpenFilteredLibrary={openLibraryWithReviewFilter}` and `onQuickSet={() => setIsQuickSetOpen(true)}`.
   - Top sidebar item for "Start" with a check mark (`✓` badge with `data-testid="start-all-done-badge"`) displayed when all 4 guided steps are completed (`allStepsDone`).
   - Landing route navigation: Evaluated on initial track load; directs empty libraries to `'start'`, and populated libraries to `'library'` (My Music) without touching `localStorage`.
2. **Quick Set Modal**:
   - Track input: Selected tracks from library/setlist, or all loaded tracks capped at 40 if none selected.
   - Energy profiles in plain words:
     - `"Build up"`: Maps to `EnergyProfile::LinearRamp`.
     - `"Peaks and breaks"`: Maps to `EnergyProfile::Wave`.
     - `"Hit hard early"`: Maps to `EnergyProfile::Plateau`.
   - Calls `backend.suggestOrder(...)`, converts suggested tracks to setlist entries with transition calculations, persists to SQLite active setlist via `backend.saveActiveSetlist(...)`, and updates the store setlist.
   - Shows energy curve preview via `EnergyChart`.
   - Identifies and highlights weak transitions (`total_cost > 0.6`) labeled as `"Check these N transitions"` (or `"1 transition"`).
3. **Simpler My Set Top Bar**:
   - Clean top bar with exactly three primary action buttons:
     - `Suggest order` (`data-testid="setlist-suggest-btn"`)
     - `Play set` (`data-testid="setlist-play-btn"`)
     - `Export` (`data-testid="setlist-export-btn"`)
   - `More ▾` dropdown menu encapsulating secondary and advanced actions:
     - Energy Arc selection (`Linear Ramp`, `Wave`, `Plateau`)
     - Setlist Pins (`Lock Opener`, `Lock Closer`)
     - History actions (`Undo`, `Redo`)
     - `Export options...`
     - `⚡ Quick set...`
     - `Clear set`
   - Accessible screen-reader button with `aria-label="Export options"` provided for assistive technology and test suite compatibility.
4. **Plain-Word Export Dialog**:
   - Redesigned format selector in `SetlistView.tsx` with plain-language options and one-line descriptions:
     - `"Rekordbox file"`: "Export hot cues and beat grids for Pioneer CDJs and Rekordbox."
     - `"Playlist (M3U8)"`: "Universal playlist file compatible with media players and other DJ software."
     - `"Printable set sheet"`: "Printable tracklist and transition plan in CSV and Markdown."
5. **Stage Mode Entry Labeling**:
   - Renamed Stage Mode entry buttons across the app to `"Play set"` (in `Sidebar.tsx`, `StartScreen.tsx`, and `SetlistView.tsx`).
   - Stage Mode internals remain untouched.

Tests:
- `ui/src/features/setlist/quickSet.test.tsx` (4 tests):
  - Caps unselected library tracks at 40.
  - Suggests order and saves active setlist for each plain-word energy choice ("Build up", "Peaks and breaks", "Hit hard early").
  - Identifies and lists weak transitions with `cost > 0.6` as "Check these N transitions".
  - Renders the energy curve chart after ordering.
- `ui/src/features/start/landingRoute.test.tsx` (4 tests):
  - Lands on 'start' route when the library is empty.
  - Lands on 'library' (My Music) when tracks already exist in library.
  - Renders the Start nav item at top of sidebar and highlights active route.
  - Displays check mark badge (`data-testid="start-all-done-badge"`) when all four steps are completed.
- `ui/src/features/setlist/SetlistView.test.tsx` (9 tests):
  - Verifies the top bar has exactly three primary buttons: Suggest order, Play set, Export.
  - Verifies More menu contains Energy Arc, Pins, History, Export options, Quick set, and Clear set.
  - Verifies format selector renders plain words for Rekordbox file, Playlist (M3U8), and Printable set sheet.
- Test counts:
  - Rust tests: 297 passed (baseline 294).
  - UI tests: 435 passed (baseline 317).
  - Clippy, Rust formatting, and TypeScript typechecking passing with 0 errors/warnings.

Known gaps:
- none

Needs from others:
- none
