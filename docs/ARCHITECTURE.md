# SETLIST Architecture

SETLIST is a local-first desktop application developed by TRUSTNODELOGIC for preparing DJ sets. The system executes all audio decoding, digital signal processing (DSP), combinatorial sequencing, and database operations entirely on the local machine with zero external network dependencies.

---

## 1. Crate Dependency Graph

```text
+-----------------------------------------------------------------------------------+
|                                  ui (React 19)                                    |
|   Tailwind CSS  *  Zustand Store  *  TypeScript (Bindings generated via ts-rs)   |
+-----------------------------------------------------------------------------------+
                                         |
                                         | IPC (JSON-RPC Commands & Events)
                                         v
+-----------------------------------------------------------------------------------+
|                                 src-tauri (Core Shell)                            |
|   commands.rs   *   overrides.rs   *   playback.rs   *   diagnostics.rs   *   state |
+-----------------------------------------------------------------------------------+
       |                    |                    |                   |
       v                    v                    v                   v
+---------------+  +------------------+  +---------------+  +------------------+
| crates/       |  | crates/          |  | crates/       |  | crates/          |
| library-db    |  | sequencer        |  | playback      |  | exporters        |
| (SQLite + WAL |  | (Held-Karp TSP,  |  | (rodio/cpal,  |  | (Rekordbox XML,  |
|  Repo/Queue)  |  |  Cost Model,     |  |  Transport,   |  |  M3U8 Playlists, |
|               |  |  Relationships)  |  |  Metronome)   |  |  Set Sheets)     |
+---------------+  +------------------+  +---------------+  +------------------+
       |                    |                    |                   |
       +--------------------+--------------------+-------------------+
                                         |
                                         v
                       +-----------------------------------+
                       | crates/audio-analysis             |
                       | - rhythm (Tempo, Beats, Grids)    |
                       | - tonal (Chroma, Key, Tuning)     |
                       | - dynamics (Energy, Loudness)     |
                       | - structure (Segments, Cues A-H)  |
                       | - waveform (3-Band Mipmap)        |
                       +-----------------------------------+
                                         |
                                         v
                       +-----------------------------------+
                       | crates/audio-io                   |
                       | (Symphonia / Lofty / Rubato /     |
                       |  ebur128 / Blake3 Hashing)        |
                       +-----------------------------------+
                                         |
                                         v
                       +-----------------------------------+
                       | crates/core-types                 |
                       | (Shared Domain Models, Camelot,   |
                       |  Validation, AppError, ts-rs)     |
                       +-----------------------------------+

+-----------------------------------------------------------------------------------+
| tools/validate (Offline accuracy validation harness & benchmark CLI)              |
+-----------------------------------------------------------------------------------+
```

---

## 2. End-to-End Data Flow: From Scan to Export

```text
[ Audio Folder on Disk ]
         |
         v
 [ 1. File Discovery & Decode ] ──> crates/audio-io
         |                           • Format sniff (MP3, WAV, FLAC, AIFF, OGG, AAC)
         |                           • Downmix & resample to 44.1 kHz 32-bit float mono
         |                           • Blake3 audio data hash generation
         v
 [ 2. Classical DSP Analysis ] ───> crates/audio-analysis
         |                           • Rhythm: Onset detection, ACF tempo, comb filter grid
         |                           • Tonal: HPCP chromagram, key correlation, Camelot
         |                           • Dynamics: EBU R128 LUFS loudness, 1-10 energy rating
         |                           • Structure: Novelty curve, phrase boundaries, 8 cues (A-H)
         |                           • Waveform: 3-band filtered RMS preview summaries
         v
 [ 3. Relational Persistence ] ───> crates/library-db (SQLite in WAL mode)
         |                           • Tables: tracks, analyses, cues, segments, blobs
         |                           • Overrides: title, artist, bpm, key, cues (table: track_overrides)
         |                           • Songs & Setlists: songs, setlists, setlist_items, active_setlist
         v
 [ 4. Application State Bridge ] ─> src-tauri (IPC Bridge & Mutex Pools)
         |                           • Push analysis progress events to frontend
         |                           • Hydrate active setlist and tracks on boot
         |                           • Re-apply user overrides transparently
         v
 [ 5. UI Workspace & Advisory ] ──> ui (React / Zustand store)
         |                           • Virtualized table, waveform canvas, harmonic filters
         |                           • Cost model weights tuning (CostModelConfig)
         |                           • Combinatorial track ordering & transition advisor
         |                           • Stage Mode live performance HUD with wake lock
         v
 [ 6. Audio Transport Playback ] ─> crates/playback
         |                           • Real-time decoding and output via cpal/rodio
         |                           • Audible beat-grid metronome clicks and speed control
         v
 [ 7. Targeted Export ] ──────────> crates/exporters
                                     • Rekordbox XML (cues, beat grids, tags)
                                     • Extended M3U8 (relative and absolute paths)
                                     • Set Sheets (CSV and formatted Markdown)
```

---

## 3. Tauri IPC Command Map

All IPC commands are registered in `src-tauri/src/lib.rs` and communicate across the Tauri IPC boundary using serialized JSON-RPC with structured `AppError` payloads.

### `src-tauri/src/commands.rs` (Core, Sequencing, Domain & Discovery)
| Command | Parameters | Description |
|---|---|---|
| `ping` | *None* | Health-check returning `"pong"`. |
| `scan_folder` | `path: String` | Spawns background worker pool to scan and analyze audio files. |
| `list_tracks` | *None* | Returns all analyzed tracks with applied overrides. |
| `get_track` | `id: String` | Fetches a single track by ID with analysis details and overrides. |
| `suggest_order` | `request: SuggestOrderRequest` | Solves optimal track ordering using Held-Karp TSP and transition costs. |
| `get_advice` | `request: AdviceRequest` | Computes transition advice and mix instructions between two tracks. |
| `export_set` | `request: ExportRequest` | Exports setlist to Rekordbox XML, M3U8, or set sheet files. |
| `get_settings` | *None* | Loads persisted application settings and cost weights. |
| `save_settings` | `settings: AppSettings` | Persists user cost model weights and analysis preferences. |
| `validate_song_command` | `song: Song` | Runs domain validation checks on a song model. |
| `upsert_song` | `song: Song` | Inserts or updates an acoustic song entry in SQLite. |
| `get_song` | `id: String` | Retrieves a song record by its unique ID. |
| `list_songs` | *None* | Lists all songs in the catalog. |
| `delete_song` | `id: String` | Removes a song from the database. |
| `get_active_setlist` | *None* | Hydrates the working setlist on startup. |
| `save_active_setlist` | `setlist: Setlist` | Persists working setlist state to SQLite. |
| `load_setlist` | `id: String` | Loads a saved setlist by ID. |
| `list_setlists` | *None* | Returns summaries of all saved setlists. |
| `save_setlist` | `setlist: Setlist` | Saves or updates a named setlist. |
| `delete_setlist` | `id: String` | Deletes a setlist and cascades item cleanup. |
| `add_setlist_item` | `setlist_id, item, position` | Atomically inserts a performance item into a setlist. |
| `remove_setlist_item` | `setlist_id, position` | Atomically removes an item and shifts subsequent positions. |
| `move_setlist_item` | `setlist_id, from_pos, to_pos` | Reorders setlist items cleanly within a transaction. |
| `update_setlist_item` | `setlist_id, item` | Updates metadata or transition config for a setlist item. |
| `get_song_relationships` | `song_id: String` | Multi-dimensional relationship graph for a track. |
| `get_song_relationship` | `from_song_id, to_song_id` | Evaluates compatibility breakdown between two songs. |
| `get_potential_bridges` | `song_a_id, song_b_id, limit` | Discovers harmonic/tempo/energy bridge songs connecting A and B. |
| `get_catalog_clusters` | *None* | Identifies natural song clusters via connected components. |
| `get_catalog_openers_and_closers`| *None* | Detects top candidates for set openers and set closers. |
| `get_catalog_outliers` | *None* | Identifies isolated tracks lacking harmonic or tempo neighbors. |
| `get_unusual_transitions` | *None* | Highlights creative, non-obvious harmonic or tempo shifts. |
| `get_catalog_summary_stats` | *None* | Aggregates tempo distributions, key distributions, and density. |
| `explore_candidate_paths` | `request: ExplorePathsRequest` | Searches viable paths through catalog graph connecting tracks. |

### `src-tauri/src/overrides.rs` (User Analysis Overrides)
| Command | Parameters | Description |
|---|---|---|
| `set_track_override` | `track_id: String, patch: TrackOverridePatch` | Persists custom BPM, key, cues, title, and artist edits. |
| `clear_track_override` | `track_id: String` | Removes overrides and restores raw DSP analysis and tag values. |
| `get_track_override` | `track_id: String` | Fetches active override values for a track. |
| `get_track_override_flags` | `track_id: String` | Reports boolean flags indicating which fields are overridden. |

### `src-tauri/src/playback.rs` (Audio Transport & Playback)
| Command | Parameters | Description |
|---|---|---|
| `playback_load` | `path: String` | Loads an audio file into the backend playback engine. |
| `playback_play` | *None* | Starts or resumes audio playback. |
| `playback_pause` | *None* | Pauses active audio playback. |
| `playback_seek` | `position_ms: f64` | Seeks playhead to the specified millisecond offset. |
| `playback_state` | *None* | Returns playback status, playhead position, and loaded track. |
| `playback_set_click` | `enabled: bool` | Enables or disables beat-synchronous metronome clicks. |
| `playback_set_speed` | `speed: f32` | Adjusts playback rate (e.g. 0.5x to 2.0x). |
| `playback_get_speed` | *None* | Retrieves current playback speed multiplier. |
| `playback_set_volume` | `volume: f32` | Adjusts master playback volume (0.0 to 1.0). |
| `playback_get_volume` | *None* | Retrieves current master volume setting. |

### `src-tauri/src/diagnostics.rs` (System Diagnostics & Logging)
| Command | Parameters | Description |
|---|---|---|
| `get_diagnostics` | *None* | Returns OS, architecture, app version, database path, and log file path. |
| `open_log_folder` | *None* | Opens the app data folder (`%APPDATA%\com.setlist.desktop`) in file manager. |
