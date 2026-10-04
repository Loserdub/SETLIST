# s1-start-screen Start screen with four guided steps
Status: done
Changed:
- `ui/src/features/start/types.ts`
- `ui/src/features/start/startSteps.ts`
- `ui/src/features/start/StartScreen.tsx`
- `ui/src/features/start/index.ts`
- `ui/src/features/start/startSteps.test.ts`
- `ui/src/features/start/StartScreen.test.tsx`
- `docs/handoffs/s1-start-screen.md`

Added deps: none

Exact store fields used:
- `tracks`: `Track[]` (analyzed tracks in library, inspected for failed analysis or missing BPM/key)
- `isLoadingTracks`: `boolean` (live scan status for Step 1 progress indicator)
- `progress`: `ProgressEvent | null` (live stage, current, and total progress for folder scanning)
- `setlist`: `SetlistEntry[]` (current setlist entries and set length)
- `isSuggestingOrder`: `boolean` (order optimization active state for Step 3 status)
- `isStageMode`: `boolean` (active performance state for Step 4 status)
- `exportStatus`: `string | null` (active export state for Step 4 status)

Exact store actions used:
- `scanFolder`: `(path: string, backend?: Backend) => Promise<void>` (triggers folder scanning with selected path)
- `setRoute`: `(route: Route) => void` (navigates to 'setlist' when opening My Set or triggering export)
- `enterStageMode`: `() => void` (enters live performance Stage Mode when setlist has at least 2 tracks)

Exact props accepted by StartScreen (`StartScreenProps`):
- `onOpenFilteredLibrary?: () => void` (callback to open My Music filtered to tracks needing review; button is hidden if prop is omitted or if 0 tracks need review)
- `onQuickSet?: () => void` (callback to trigger Quick Set generation; button is hidden if prop is omitted)
- `onExport?: () => void` (callback to trigger setlist export; falls back to `setRoute('setlist')` if prop is omitted)
- `onChooseFolder?: () => void | Promise<void>` (optional callback for folder choosing and scanning override, useful for testing or custom dialogs)

Public API:
- `StartScreen(props: StartScreenProps): React.JSX.Element`
- `getStartSteps(state: StartStepsState): StartStep[]`
- `isTrackNeedingReview(track: Track): boolean`
- Types: `StartScreenProps`, `StartStep`, `StepStatus`, `StatusLabel`, `StartStepsState`, `StepId`

Tests:
- Pure step logic (`startSteps.test.ts` - 30 tests):
  - `isTrackNeedingReview` detection of missing analysis, non-positive or NaN BPM, and missing/invalid Camelot keys.
  - Step 1 statuses: `not_started`, `in_progress` (with and without progress event), and `done`.
  - Step 2 statuses: `not_started`, `in_progress` (with exact issue counts in singular and plural), and `done` with exact string `"All tracks look good."`.
  - Step 3 statuses: `not_started`, `in_progress` (1 track or suggesting order), and `done` (2+ tracks).
  - Step 4 statuses: `not_started` (< 2 tracks), `in_progress` (Stage Mode or exporting), and `done` (>= 2 tracks ready).
  - 10 comprehensive multi-step status combinations representing realistic user journey states.
- Render & interaction tests (`StartScreen.test.tsx` - 14 tests):
  - Render test for "Not started" status across all steps.
  - Render test for "In progress" status showing progress percentage and scanning state.
  - Render test for "Done" status showing enabled action buttons.
  - Step 1 button triggers native folder dialog and `scanFolder`, or `onChooseFolder` prop.
  - Step 2 button renders when `onOpenFilteredLibrary` is provided and issues exist; hides when prop is omitted or issues are 0.
  - Step 3 main button triggers `setRoute('setlist')`; Quick set button renders when `onQuickSet` prop is passed and hides when missing.
  - Step 4 Play set (Stage Mode) and Export buttons disabled when setlist < 2 tracks; enabled when setlist >= 2 tracks.
  - Focus rings and accessibility verification (WCAG AA text contrast and font sizes >= 12px).

Known gaps:
- StartScreen is not yet wired to a route in `App.tsx` or `Sidebar.tsx` (explicitly reserved for a later prompt).

Needs from others:
- Routing integration task to wire `'start'` route into `Route` union type and navigation bar when desired.
