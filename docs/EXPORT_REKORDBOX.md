# Rekordbox XML Export & Manual Import Guide

This document describes how to import setlists exported by DJ Set Assistant into Pioneer Rekordbox.

## Overview

The Rekordbox XML export produces a Pioneer DJ-compatible `DJ_PLAYLISTS` XML file (v1.0.0) containing:
- **`COLLECTION`**: Track metadata, file locations, durations, BPM, and musical tonality.
- **`TEMPO`**: Accurate beat grid anchor with `Inizio` (first downbeat in seconds to 3 decimal places), `Bpm`, and `Metro="4/4"`.
- **`POSITION_MARK`**: Hot cues A through H (Type 0, Num 0-7), memory cues (Num -1), and loop cues (Type 4 with `End` timestamp), complete with RGB pad colors.
- **`PLAYLISTS`**: A curated playlist node preserving the setlist track order.

---

## Manual Import Checklist

Follow these steps to import the exported XML file into Rekordbox (versions 5.x, 6.x, and 7.x):

### 1. Configure Rekordbox XML Preferences
1. Open Rekordbox.
2. Open **Preferences** (`Ctrl + ,` on Windows or `Cmd + ,` on macOS).
3. Select the **Advanced** tab and navigate to the **Database** sub-tab.
4. Under **rekordbox xml**:
   - Ensure the feature is enabled.
   - Click **Browse** next to **Imported Library** and select your exported XML file (e.g. `setlist.xml`).
5. Close the Preferences window.

### 2. Locate and Inspect the Playlist
1. In the Rekordbox left sidebar / tree view, locate and expand the **rekordbox xml** entry.
2. Expand **Playlists**.
3. Locate the exported setlist playlist (default name: `SETLIST`).
4. Click on the playlist to preview the tracks, BPM, Key, and Cue Points.

### 3. Import to Collection
1. Right-click the playlist under **rekordbox xml** > **Playlists**.
2. Select **Import Playlist** to import the entire ordered setlist into your Rekordbox Library.
3. Alternatively, drag and drop tracks or playlists directly into your main collection or iTunes/rekordbox folders.

---

## Verification Checklist

After importing, verify the following details on loaded tracks:

- [ ] **File Location**: Tracks load without missing file warnings (yellow exclamation mark). Location paths are percent-encoded `file://localhost/` URIs supporting Windows drive letters and spaces.
- [ ] **Beat Grid & Tempo**: First downbeat (`Inizio`) snaps accurately to the first downbeat marker (red beat marker #1).
- [ ] **Hot Cue Registers (A–H)**: Hot cues 0 through 7 appear on performance pads with designated RGB colors.
- [ ] **Loop Cues (Cue H)**: Type 4 loop cue displays active loop start and end markers on the waveform.
- [ ] **Key / Tonality**: The `Key` column displays the correct tonality format (standard e.g. `Am`, `C` or Camelot e.g. `8A`, `8B`).

---

## Notes & Verification Warnings

> [!NOTE]
> **Key Display in Rekordbox**: Rekordbox can display either alphanumeric (Camelot) or classic musical notation depending on user preferences in **Preferences > View > Key display format**. Ensure the export option (`KeyNotation::Standard` vs `KeyNotation::Camelot`) aligns with your preferred Rekordbox view. The Tonality and Camelot display behavior must be verified in a real Rekordbox import.
