# DJ Set Assistant — Validation & Rekordbox Manual Import Checklist

This document details the end-to-end procedure for validating audio analysis accuracy on real music collections, as well as the manual inspection checklist for importing generated Rekordbox XML playlists into Pioneer Rekordbox DJ software.

---

## 1. Automated Audio Accuracy Validation (`tools/validate`)

The repository includes a dedicated validation tool located at `tools/validate` designed to benchmark analysis accuracy against real audio files and reference ground truth.

### 1.1 Running Folder Analysis

To scan and extract DSP metrics across any folder of audio files (WAV, MP3, FLAC, AIFF, OGG, M4A):

```bash
cargo run --bin validate -- "C:/Path/To/Your/Music"
```

This prints RFC 4180 compliant CSV output to standard output:
```csv
file,bpm,key,camelot,lufs,energy
"01_deep_dive.mp3",126.0,"A minor",8A,-13.8,7
"02_skyline.wav",128.2,"C major",8B,-14.1,8
...
```

You can optionally save the output CSV to disk using `--output`:
```bash
cargo run --bin validate -- "C:/Path/To/Your/Music" --output results.csv
```

### 1.2 Benchmarking Against Ground-Truth Metadata

To compute automated accuracy metrics, provide a ground-truth CSV file with columns `file,bpm,key`:

```csv
file,bpm,key
01_deep_dive.mp3,126.0,8A
02_skyline.wav,128.0,C major
03_nocturnal.flac,174.0,Am
```

Run with `--ground-truth` (or `-g`):
```bash
cargo run --bin validate -- "C:/Path/To/Your/Music" --ground-truth "ground_truth.csv"
```

The tool will compute and print:
- **BPM within ±0.5**: Percentage and count of tracks within half a BPM of ground truth.
- **BPM correct up to an Octave**: Considers octave doublings (x2) and half-time (x0.5) within 3% or ±0.5 BPM.
- **Mean Absolute BPM Error**: Overall tempo discrepancy.
- **Exact Key Match**: Pitch class and musical mode matching reference.
- **Camelot-Adjacent Key (`d <= 1`)**: Harmonic transitions within 1 step on the Camelot wheel (harmonic fifths, relative minor/major switches).
- **Harmonic Breakdown**: Distribution across exact, relative, fifth, adjacent, and distant keys.
- **Worst 10 Files**: Ranked list of highest discrepancies to easily isolate problem tracks or difficult genres.

---

## 2. Rekordbox Manual Import Checklist

Follow these steps to import an exported Rekordbox XML playlist into Pioneer Rekordbox and verify beat grids, cue points, keys, and track sequencing.

### Step 1: Export Setlist from DJ Set Assistant

1. In DJ Set Assistant, navigate to the **Setlist** view (`🎛️ Setlist`).
2. Add your desired tracks, optimize the sequence with **Suggest Order**, or manually arrange track ordering.
3. In the export dropdown, select **Rekordbox XML** and click **Export**.
4. The file is saved to your application directory or chosen location (e.g. `setlist_export_YYYYMMDD.xml`).

---

### Step 2: Configure Rekordbox to Read the XML

1. Open **Rekordbox** (Version 6 or 7).
2. Open Preferences:
   - Windows: `File` -> `Preferences` (or press `Ctrl + ,`).
   - macOS: `rekordbox` -> `Preferences` (or press `Cmd + ,`).
3. Click on the **Advanced** tab at the top.
4. Select the **Database** sub-tab.
5. In the **rekordbox xml** section:
   - Click **Browse** and locate the exported XML file (e.g. `setlist_export_1727800000.xml`).
6. Click on the **View** tab in Preferences:
   - Under **Layout**, ensure **rekordbox xml** is checked so it appears in the left tree navigation.
7. Close Preferences.

---

### Step 3: Inspect & Import XML Playlist

1. In the Rekordbox left sidebar tree, look for the **rekordbox xml** item.
2. Expand **rekordbox xml** -> **Playlists**.
3. You will see the exported playlist (e.g., `SETLIST Export` or your setlist title).
4. Click on the playlist to preview the tracks in the main Rekordbox browser table.
5. To import into your permanent collection:
   - Right-click the playlist and select **Import to Collection**, or
   - Right-click and select **Import Playlist**.

---

### Step 4: Verification Checklist

Inspect the imported tracks in Rekordbox against the checklist below:

#### 1. Beat Grids & Tempo
- [ ] **First Downbeat Alignment**: Load Track 1 into Deck 1. The white beat marker (Beat 1) should align precisely with the first transient/kick drum downbeat.
- [ ] **BPM Readout**: The BPM displayed on the deck should match the BPM reported by DJ Set Assistant (within ±0.1 BPM).
- [ ] **Grid Stability & Phase**: Zoom in to maximum waveform resolution (`+`). Move through the track and ensure the white and red beat grid lines remain aligned with kicks and claps without drifting over 32+ bars.

#### 2. Hot Cues & Memory Cues (Registers A through H)
Inspect the hot cue panel in Rekordbox (Hot Cue buttons A through H):
- [ ] **Cue A (First Downbeat)**: Positioned at beat 1 (`time_ms`), labeled "First downbeat" or "Downbeat", color orange/red (`#FF5500`).
- [ ] **Cue B (Intro End)**: Located where the main percussion/bass enters, labeled "Intro End", color green (`#00FF00`).
- [ ] **Cue C (First Breakdown)**: Marked at the start of the first breakdown, color blue (`#0088FF`).
- [ ] **Cue D (First Drop)**: Positioned exactly at the first drop downbeat, color rose/pink (`#FF0055`).
- [ ] **Cue E & F (Second Breakdown & Second Drop)**: Present if the track contains a second buildup/drop progression.
- [ ] **Cue G (Mix-Out Point)**: Placed at the beginning of the outro section, color white (`#FFFFFF`).
- [ ] **Cue H (Loop)**: If an outro percussive loop was generated, Cue H should be configured as an active or hot loop with both start and end times highlighted.

#### 3. Musical Key Display
- [ ] **Key Column Notation**: Verify that Rekordbox displays the Camelot key (e.g. `8A`, `11B`) or classic key (`Am`, `G`) matching the key detected in the app.
- [ ] **Harmonic Traffic Light**: Turn on Rekordbox's Master Deck key sync / harmonic traffic light indicator. Adjacent compatible tracks in the playlist should highlight green.

#### 4. Playlist Order & Transitions
- [ ] **Track Order**: Confirm that tracks appear in the exact numerical order (1, 2, 3...) determined by the DJ Set Assistant sequencer.
- [ ] **Transition Boundaries**: Verify that phrase boundaries (16 or 32 bars) align with the transition advice notes provided in the setlist view.

---

## 3. Common Troubleshooting

| Symptom | Cause | Solution |
|---|---|---|
| Rekordbox XML playlist shows orange exclamation mark ("File Not Found") | Audio file path in XML uses relative or moved path | Ensure the exported XML contains absolute paths (e.g., `file://localhost/C:/Music/...`). If files moved, use Rekordbox `File -> Relocate`. |
| Beat grid starts half a beat late | Complex intro or vocal pickup before beat 1 | In Rekordbox, shift the grid by 1 beat or use DJ Set Assistant to snap to the first marked downbeat. |
| Cue points do not appear on decks | Rekordbox preferences configured to ignore XML cues | Under Preferences -> `CDJ & Device` -> ensure `Auto Cue` and `Hot Cue Auto Load` are enabled. |
| Key displays in classic notation instead of Camelot | Rekordbox user preference setting | Go to `Preferences` -> `View` -> `Key display format` and select `Alphanumeric (Camelot)`. |
