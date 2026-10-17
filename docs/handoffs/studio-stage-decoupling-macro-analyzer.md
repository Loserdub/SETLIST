# studio-stage-decoupling-macro-analyzer: Decouple Studio Environment, Quarantine Stage Components, and Macro Sequence Analysis

Status: done
Changed:
- `ui/src/config/stageFeatureFlag.ts` (created feature flag resolver for stage mode quarantine)
- `ui/src/components/routes/StageRoute.tsx` (enforced strict routing quarantine boundary)
- `ui/src/components/routes/StageRoute.test.tsx` (quarantine unit tests)
- `ui/src/components/Sidebar.tsx` (quarantined Stage Mode navigation button behind feature flag)
- `ui/src/features/start/StartScreen.tsx` (quarantined Stage Mode launch button behind feature flag)
- `ui/src/features/discovery/CatalogClustersView.tsx` (purged transient live deck and radar imports)
- `ui/src/features/discovery/CatalogClustersView.test.tsx` (verified pure catalog cluster rendering)
- `ui/src/features/setlist/MacroSetlistAnalyzer.tsx` (created static macro sequence analyzer)
- `ui/src/features/setlist/MacroSetlistAnalyzer.test.tsx` (verified aggregate playtime, energy arc, and clash metrics)
- `ui/src/features/setlist/TransitionCostBadge.tsx` (flagged harmonic distance d > 2 and ΔBPM > 8 clashes)
- `ui/src/features/setlist/TransitionCostBadge.test.tsx` (verified clash badge rendering)
- `ui/src/features/setlist/SetlistView.tsx` (integrated MacroSetlistAnalyzer into Studio view)
- `ui/src/features/setlist/index.ts` (exported MacroSetlistAnalyzer)
- `ui/src/features/stage/StageMode.tsx` (quarantined live deck state and hydrated liveSetlist via StageControlsStore)
- `ui/src/features/stage/store/useStageControlsStore.ts` (isolated volatile liveSetlist and detour queue state)
- `ui/src/features/stage/store/detourImmutability.test.ts` (verified studio setlist immutability during detours)
- `ui/src/features/stage/store/useStageControlsStore.test.ts` (verified live detour queue and persistence suppression)
- `ui/src/store/useAppStore.ts` (strict separation of concerns: studio setlist remains immutable during detours; suppressed SQLite persistence in Stage Mode)

Added deps:
- None.

Public API:
- `isStageModeEnabled(): boolean` (`ui/src/config/stageFeatureFlag.ts`)
- `<MacroSetlistAnalyzer setlist={entries} />` (`ui/src/features/setlist/MacroSetlistAnalyzer.tsx`)
- `computeMacroSequenceMetrics(setlist: SetlistEntry[]): MacroSequenceMetrics` (`ui/src/features/setlist/MacroSetlistAnalyzer.tsx`)
- `formatAggregatePlaytime(totalSeconds: number): string` (`ui/src/features/setlist/MacroSetlistAnalyzer.tsx`)
- `useStageControlsStore.getState().initLiveSetlist(entries: SetlistEntry[]): void`
- `useStageControlsStore.getState().stageQueueTrackNext(track: Track, currentPlayheadIndex?: number): void`
- `useStageControlsStore.getState().stageReplaceNextTrack(track: Track, currentPlayheadIndex?: number): void`

Tests:
- `ui/src/components/routes/StageRoute.test.tsx`: Validates quarantine gate and fallback navigation.
- `ui/src/features/discovery/CatalogClustersView.test.tsx`: Validates clean catalog rendering without live-deck widgets.
- `ui/src/features/setlist/MacroSetlistAnalyzer.test.tsx`: Validates aggregate playtime math, static SVG energy arc computation, harmonic ($d \le 2$) and tempo ($|\Delta\text{BPM}| \le 8$) clash detection.
- `ui/src/features/setlist/TransitionCostBadge.test.tsx`: Confirms analytical `[ ⚠ CLASH ]` badge rendering for dissonant or tempo-mismatched transitions.
- `ui/src/features/setlist/SetlistView.test.tsx`: Confirms integration of analyzer within studio setlist builder.
- `ui/src/features/stage/store/detourImmutability.test.ts`: Confirms `useAppStore.setlist` is 100% immutable across detour inserts and swaps.
- `ui/src/features/stage/store/useStageControlsStore.test.ts`: Confirms stage detour queues mutate only `liveSetlist` and SQLite persistence is air-gapped during live performance.

Known gaps:
- None. All requirements and constraints pass strictly.

Needs from others:
- None.
