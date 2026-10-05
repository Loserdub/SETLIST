# fix-playhead-volume-title-branding Audio Seeking, Playhead Tracking, Global Volume, Metadata Overrides, and Branding
Status: done
Changed:
- crates/playback/src/player.rs
- src-tauri/src/playback.rs
- ui/src/utils/trackDisplay.ts
- ui/src/utils/trackDisplay.test.ts
- ui/src/store/useAppStore.ts
- ui/src/components/transport/GlobalTransportBar.tsx
- ui/src/features/library/LibraryView.tsx
- ui/src/features/library/filters.ts
- ui/src/features/library/sorting.ts
- ui/src/features/track/TrackView.tsx
- ui/src/features/track/TrackView.test.tsx
- ui/src/components/Sidebar.tsx
- docs/handoffs/fix-playhead-volume-title-branding.md
Added deps: None
Public API:
- `getTrackDisplayTitle(track: Track | null, overrideTitle?: string | null): string`: Extracts clean song title from ID3 tags or parses filename if tags are absent.
- `getTrackDisplayArtist(track: Track | null, overrideArtist?: string | null): string`: Extracts clean artist from ID3 tags or parsed filename.
- `setTrackTitleOverride(trackId: string, title?: string | null): void`: Store action for persisting local in-app track title overrides.
- `setTrackArtistOverride(trackId: string, artist?: string | null): void`: Store action for persisting local in-app track artist overrides.
- `setMasterVolume(volume: number): Promise<void>`: Sets global master volume across frontend state and native audio engine.
Tests:
- `ui/src/utils/trackDisplay.test.ts`: 6 tests verifying extension stripping, leading track number removal, Artist - Title pattern splitting, and in-app overrides.
- `ui/src/features/track/TrackView.test.tsx`: 18 tests including test verifying in-app metadata editing form, saving custom overrides, displaying custom badges, and resetting back to original.
- Workspace test suites: 317 Vitest UI tests passing, all Rust crate tests passing, cargo clippy passing without warnings, cargo fmt passing.
Known gaps: None.
Needs from others: None.
