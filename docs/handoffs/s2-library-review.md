# s2-library-review Library Review Filter, Legend Popover, Row Actions, and Empty State Redesign
Status: done
Changed:
- ui/src/features/library/types.ts
- ui/src/features/library/filters.ts
- ui/src/features/library/navigation.ts
- ui/src/features/library/index.ts
- ui/src/features/library/LibraryView.tsx
- ui/src/features/library/LibraryView.test.tsx
- ui/src/features/library/pure.test.ts
- ui/src/components/routes/LibraryRoute.tsx
- docs/handoffs/s2-library-review.md

Added deps: none

Public API:
- `openLibraryWithReviewFilter(): void`: Exported from `ui/src/features/library` and `ui/src/components/routes/LibraryRoute.tsx`. Switches current route to `'library'` and activates the review filter (`needsReviewOnly: true`). Designed for direct invocation by the Start screen or any navigation trigger.
- `isTrackNeedsReview(track: Track): boolean`: Pure function evaluating whether a track needs review. Note on Key confidence: `Key` in `crates/core-types` and TS bindings (`Key.ts`) does not contain a confidence field; review classification checks failed analysis (`!track.analysis`), missing or non-positive BPM (`bpm <= 0`), and missing Camelot key.
- `isTrackEdited(track: Track, titleOverrides?: Record<string, string>, artistOverrides?: Record<string, string>): boolean`: Pure function detecting whether a track has active user edits/overrides across title, artist, BPM, downbeat, key, or cue points.
- `LibraryFilters.needsReviewOnly?: boolean`: Added to filter criteria and defaulted to `false` in `DEFAULT_FILTERS`.

Tests:
- Review filter logic: pure unit tests in `ui/src/features/library/pure.test.ts` covering unanalyzed tracks, zero/missing BPM, missing Camelot keys, completely analyzed healthy tracks, user edit detection via store overrides and override flags, and filtered track slicing.
- Empty state: verified in `LibraryView.test.tsx` and `firstLaunch.test.tsx`, testing the three concise onboarding lines, SETLIST product branding, and prominent Choose Folder button.
- Count line: verified in `LibraryView.test.tsx`, testing exact formatting `"N tracks, M in your set"` and dynamic updates as tracks enter the setlist.
- Metadata legend popover: verified in `LibraryView.test.tsx`, testing "?" trigger, modal popover rendering one-line explanations for BPM, Key (Camelot), Energy (1 to 10), and LUFS, and Escape key dismissal.
- Row actions: verified in `LibraryView.test.tsx`, testing Preview playback toggle, Open detail navigation, and Add to set list additions with hover/focus-within visibility.
- Navigation trigger: verified in `LibraryView.test.tsx`, testing `openLibraryWithReviewFilter()`.

Known gaps:
- none

Needs from others:
- none
