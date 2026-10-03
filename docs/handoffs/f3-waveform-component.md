# f3-waveform-component 3-Band Waveform Canvas Component with Structure Overlays and Track View
Status: done
Changed:
- ui/src/components/waveform/waveformMath.ts
- ui/src/components/waveform/waveformMath.test.ts
- ui/src/components/waveform/WaveformCanvas.tsx
- ui/src/components/waveform/WaveformMinimap.tsx
- ui/src/components/waveform/WaveformContainer.tsx
- ui/src/components/waveform/index.ts
- ui/src/features/track/types.ts
- ui/src/features/track/useTrackState.ts
- ui/src/features/track/TrackView.tsx
- ui/src/features/track/TrackView.test.tsx
- ui/src/features/track/index.ts
- ui/src/components/routes/TrackRoute.tsx
- docs/handoffs/f3-waveform-component.md

Added deps:
- None (pure HTML5 2D canvas, React 19, TypeScript, and Tailwind).

Public API:
- `ui/src/components/waveform`:
  - `export function timeToPixel(timeMs: number, startTimeMs: number, visibleDurationMs: number, canvasWidth: number): number`: Pure coordinate mapping.
  - `export function pixelToTime(pixelX: number, startTimeMs: number, visibleDurationMs: number, canvasWidth: number): number`: Pure coordinate mapping.
  - `export function clampViewport(startTimeMs: number, visibleDurationMs: number, totalDurationMs: number): number`: Boundary clamping.
  - `export function getVisibleWindow(totalDurationMs: number, zoomLevel: number, scrollOffsetMs: number): VisibleWindow`: Viewport calculations.
  - `export function sliceWaveformWindow(waveform: Waveform3Band, startTimeMs: number, endTimeMs: number, totalDurationMs: number): WaveformSlice`: Slices visible sample indices.
  - `export function filterVisibleBeats(beatsMs: number[], downbeatFlags: boolean[], startTimeMs: number, endTimeMs: number, canvasWidth: number, paddingMs?: number): VisibleBeat[]`
  - `export function filterVisibleSegments(segments: Segment[], startTimeMs: number, endTimeMs: number): Segment[]`
  - `export function filterVisibleCues(cues: CuePoint[], startTimeMs: number, endTimeMs: number, paddingMs?: number): CuePoint[]`
  - `export function formatTimeMs(ms: number): string`: DJ timestamp format `mm:ss.ms`.
  - `export const WaveformCanvas: React.FC<WaveformCanvasProps>`: 60fps high-DPI HTML5 canvas rendering low band (blue), mid band (amber), high band (white), beat ticks, downbeat lines, segment overlays, cue flags A-H, playhead, and zoom/pan drag interactions.
  - `export const WaveformMinimap: React.FC<WaveformMinimapProps>`: Interactive whole-track overview with condensed 3-band waveform, segments, cue dots, and draggable viewport window.
  - `export const WaveformContainer: React.FC<WaveformContainerProps>`: Container hosting zoom controls (+, -, Fit, 2x, 4x, 8x, 16x, 32x), time display, canvas, and minimap.
- `ui/src/features/track`:
  - `export const TrackView: React.FC`: Track view route displaying track details, Camelot key chip, BPM, energy, loudness metrics, 3-band waveform, cue registers A-H, and structural segments.
  - `export const useTrackState: ZustandStore<TrackStateStore>`: Store for zoom level, scroll offset, and playhead position.

Tests:
- `ui/src/components/waveform/waveformMath.test.ts` (14 unit tests):
  - Pure time-to-pixel and pixel-to-time conversions with boundary and degenerate cases.
  - Time/pixel reversible round-trips.
  - Viewport offset clamping (cannot pan before 0 or past track duration).
  - Visible window span calculation across zoom levels (1x, 2x, 4x, Fit).
  - Waveform sample window slicing for both standard `points_per_sec` (150 pts/sec) and condensed arrays.
  - Visible beat filtering with downbeat flag association and pixel coordinate projection.
  - Structural segment clipping and intersection testing.
  - Cue marker and loop span filtering.
  - DJ mm:ss.ms time formatting.
- `ui/src/features/track/TrackView.test.tsx` (7 integration tests):
  - Renders empty state placeholder when no track is selected.
  - Renders track title, artist, Camelot key (1A), BPM (120.0), and energy score (1/10).
  - Renders the 3-band waveform container with canvas, minimap, and playhead indicator.
  - Renders all cue points (Registers A to H) with colors and labels.
  - Clicking a cue card jumps playhead and scrolls waveform to cue time.
  - Zoom in and zoom out buttons adjust zoom level.
  - Renders structural segments and clicking a segment jumps playhead to segment start.

Known gaps:
- Audio preview playback is explicitly out of scope for v1 per AGENTS.md section 8. Playhead is purely visual.

Needs from others:
- Workgroup Integration (G1/G2) to stream actual decoded track analysis from native Rust backend into UI state.
