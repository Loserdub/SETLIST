# F1 UI Shell, Routing, and Mock Backend
Status: done
Changed:
- ui/src/utils/camelotColor.ts
- ui/src/utils/camelotColor.test.ts
- ui/src/api/index.ts
- ui/src/api/index.test.ts
- ui/src/store/useAppStore.ts
- ui/src/components/Sidebar.tsx
- ui/src/components/routes/LibraryRoute.tsx
- ui/src/components/routes/TrackRoute.tsx
- ui/src/components/routes/SetlistRoute.tsx
- ui/src/components/routes/SettingsRoute.tsx
- ui/src/App.tsx
- ui/src/App.test.tsx
- docs/handoffs/010-ui-shell-mock-backend.md

Added deps: none (used existing react, zustand, tailwindcss, vitest, testing-library)

Public API:
- `ui/src/utils/camelotColor.ts`:
  - `pub fn camelotColor(key: CamelotKey | string): string` (hex color for all 24 Camelot keys)
  - `pub fn camelotTextColor(key: CamelotKey | string): string` (readable text contrast hex)
  - `pub fn normalizeCamelotKey(key: CamelotKey | string): string`
  - `pub const ALL_CAMELOT_KEYS: string[]`
- `ui/src/api/index.ts`:
  - `export interface Backend`:
    - `ping(): Promise<string>`
    - `scanFolder(path: string): Promise<Track[]>`
    - `listTracks(): Promise<Track[]>`
    - `getTrack(id: string): Promise<Track | null>`
    - `suggestOrder(trackIds: string[], profile?: EnergyProfile, weights?: CostWeights): Promise<SetlistEntry[]>`
    - `getAdvice(trackAId: string, trackBId: string): Promise<TransitionAdvice>`
    - `exportSet(entries: SetlistEntry[], target: ExportTarget, outputPath?: string): Promise<string>`
    - `subscribeProgress(callback: (event: ProgressEvent) => void): () => void`
    - `onProgress(callback: (event: ProgressEvent) => void): () => void`
  - `export const mockBackend: Backend` (generates 40 tracks spanning all 24 Camelot keys, fake analysis, fake 3-band waveforms, fake cues A-H, simulated progress)
  - `export const tauriBackend: Backend` (throws "not wired")
  - `export function getBackend(useMock?: boolean): Backend`
  - `export function setUseMockBackend(useMock: boolean): void`
  - `export let USE_MOCK_BACKEND: boolean`
- `ui/src/store/useAppStore.ts`:
  - `export const useAppStore: UseBoundStore<StoreApi<AppState>>`
  - Navigation state (`currentRoute: 'library' | 'track' | 'setlist' | 'settings'`)
  - Tracks state (`tracks`, `selectedTrack`, `loadTracks`, `scanFolder`, `selectTrack`)
  - Setlist state (`setlist`, `addToSetlist`, `removeFromSetlist`, `suggestOrder`, `setEnergyProfile`, `setCostWeights`, `exportSetlist`)
  - Background progress state (`progress`)
  - Tauri ping integration (`fetchPing`, `pingResult`)

Tests:
- `ui/src/utils/camelotColor.test.ts`:
  - Verifies exact hex color returned for all 24 Camelot keys (1A-12A, 1B-12B).
  - Verifies normalization for lowercase inputs and string representations.
  - Verifies high-contrast text color pairing for all keys.
  - Verifies fallback color for unknown keys.
- `ui/src/api/index.test.ts`:
  - Verifies `mockBackend.listTracks()` returns 40 tracks.
  - Verifies all 24 Camelot keys are represented across generated tracks.
  - Verifies `mockBackend.getTrack()` returns complete track with analysis, cues, segments, and waveform.
  - Verifies `mockBackend.scanFolder()` emits progress events and yields tracks.
  - Verifies `mockBackend.suggestOrder()` reorders tracks and populates transition metadata.
  - Verifies `mockBackend.getAdvice()` computes tempo difference, harmonic shifts, and transition types.
  - Verifies `mockBackend.exportSet()` succeeds for XML, M3U8, and SetSheet targets.
  - Verifies `tauriBackend` methods throw "not wired" error.
  - Verifies `getBackend()` correctly toggles between mock and Tauri backends.
- `ui/src/App.test.tsx`:
  - Verifies sidebar rendering and navigation across Library, Track, Setlist, and Settings routes.
  - Verifies empty route presentation for Library and Setlist.
  - Verifies Settings route ping integration.
  - Verifies Zustand store ping action.

Known gaps:
- Native Tauri commands (G1/G2 integration) will wire `tauriBackend` to Rust IPC.
- Drag-and-drop setlist reordering (`dnd-kit`) arrives in F4.
- High-performance canvas waveform zoom/pan arrives in F3.

Needs from others:
- Workgroup Integration (Wave 2, G1/G2) to wire native Tauri IPC commands matching the `Backend` interface.
