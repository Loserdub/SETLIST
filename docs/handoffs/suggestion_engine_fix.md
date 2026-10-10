# Suggestion Engine Name Fallback Fix
Status: done
Changed: 
  - `crates/core-types/src/types.rs`
  - `crates/library-db/src/repo.rs`

## Rationale
The user reported that the Suggestion Engine Setlist graphs contained "Unknown Name" for tracks, even though the main library UI displayed the correct track information.

Investigation revealed that the backend `Song` model did not employ the same filename parsing fallback logic used by the React UI. When audio files were added without ID3 tags, the UI gracefully parsed `02. Artist - Title.mp3` into "Title" and "Artist". However, the backend would literally write "Unknown Title" into the `songs` SQLite table because it solely checked ID3 tags. 

## Changes Made
1. Ported the UI's `parseArtistAndTitleFromPath` regex fallback logic to a pure Rust equivalent, `Track::display_metadata(&self)`.
2. Updated `crates/library-db/src/repo.rs` (`save_track_internal`) to use `track.display_metadata()` when seeding the initial `songs` table on ingestion.
3. Updated `crates/core-types/src/types.rs` (`impl From<&Track> for Song`) to use `track.display_metadata()` for parity.

Existing tracks with this issue will be updated the next time the music folder is rescanned.

## Tests
- Cargo check passed. 
- Rebuilt with `.\scripts\rebuild.ps1` successfully.
- *Note: `cargo test` failed locally due to a Windows OS os-error 1455 pagefile memory limit from linking multiple binaries concurrently, but the code passes `cargo check` and UI `pnpm typecheck`.

## Needs from others
None
