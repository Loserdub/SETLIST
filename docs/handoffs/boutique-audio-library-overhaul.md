# boutique-audio-library-overhaul Boutique Brand Audio Library Overhaul (Zero Cyan/Neon)
Status: done
Changed:
- ui/src/index.css
- ui/src/features/library/LibraryView.tsx
- ui/src/features/library/TrackInspectionDrawer.tsx
- ui/src/features/library/EmptyLibraryView.tsx
- ui/src/features/library/IngestionInstrumentDisplay.tsx
- ui/src/features/library/ScanReportModal.tsx
- ui/src/features/library/StructuralMiniMap.tsx
- ui/src/features/library/DropZoneOverlay.tsx

Added deps: none

Public API: unchanged, all existing data-testids, ARIA roles, props, and test contracts preserved.

Tests:
- `pnpm --dir ui test src/features/library/`: 52 passed across 4 files
- `pnpm --dir ui test`: 484 passed across 44 files
- `pnpm --dir ui typecheck`: 0 errors
- `cargo test --workspace`: 296 passed
- `cargo clippy --workspace -- -D warnings`: 0 warnings
- `cargo fmt --check`: 0 formatting issues

Design Overhaul Summary:
- Removed all electric cyan (#38bdf8, #00F0FF, cyan-*), blues, and cyberpunk neon glows across the entire Library feature and global focus rings.
- Implemented boutique brand audio industrial design aesthetic (Teenage Engineering, Elektron, Nagra, Braun/Dieter Rams):
  - Deep matte black and studio graphite chassis (#09090b, #0c0c0f, #121215).
  - Anodized aluminum / titanium borders (#27272a, #323238, #3f3f46).
  - Bone white / chalk typography (#f4f4f5, #e4e4e7, text-zinc-200, text-zinc-400) with tabular engineering metrics (.te-num, tabular-nums).
  - Studio amber (#f59e0b) and warm green (#10b981) for physical LED status beacons and active latch states.
  - Tactile physical control keycap guide ribbon ([SPACE] AUDITION · [ENTER] + SET · [I] INSPECT · [↑/↓] NAVIGATE).
  - 3-band waveform inspection canvas rendered in studio frequency tiers: warm amber (#f59e0b) for sub/lows, chalk white (#e4e4e7) for mids/vocals, and terracotta (#ea580c) for highs.
  - High-contrast, WCAG AA compliant architectural focus rings (2px solid #a1a1aa).

Known gaps: none
Needs from others: none
