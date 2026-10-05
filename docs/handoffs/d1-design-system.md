# d1-design-system Ableton x Teenage Engineering Hardware Design System

Status: done

## Summary
Introduced the Ableton meets Teenage Engineering dark mode design system for SETLIST:
- Hardware-like dense aesthetic: flat charcoal panels divided by 1px hairlines, zero blur/shadows/glows/gradients.
- Modular panels with silkscreen uppercase captions.
- Hot orange accent (`#ff5500`) reserved strictly for primary actions, selection, playheads, and focus rings.
- Flat saturated clip colors for data: 12 Camelot wheel hues (minor deep, major light) and a 10-step energy ramp from blue-gray to bright yellow (neither using accent orange).
- Large tabular mono readouts for BPM, key, time, and LUFS.
- 15 hardware-style primitives in `ui/src/components/ui/` with unit tests in `primitives.test.tsx`.
- Complete restyle of `ui/src/features/library/LibraryView.tsx` and `ui/src/components/transport/GlobalTransportBar.tsx`.
- Zero raw hex colors remaining across all owned files.

## Changed Files
- `ui/package.json` - Added `@fontsource-variable/archivo`, `@fontsource/ibm-plex-mono`, and `lucide-react`
- `pnpm-lock.yaml` - Locked local font packages and icon library
- `ui/src/index.css` - Local font imports, design tokens mapped into Tailwind `@theme`, focus rings, silkscreen typography, and hardware transitions
- `ui/src/components/ui/Button.tsx` - Hardware button (primary, secondary, ghost, danger)
- `ui/src/components/ui/IconButton.tsx` - Square icon button with tooltip support
- `ui/src/components/ui/ToggleKey.tsx` - Square key with live status LED
- `ui/src/components/ui/Segmented.tsx` - Flat segmented control with 1px hairlines
- `ui/src/components/ui/Fader.tsx` - Hardware fader/slider with inset track and thumb
- `ui/src/components/ui/Meter.tsx` - Segmented LED meter (10 segments default)
- `ui/src/components/ui/Readout.tsx` - Inset hardware module with silkscreen caption and large mono readout
- `ui/src/components/ui/KeyTile.tsx` - Flat colored Camelot key badge using design tokens
- `ui/src/components/ui/Panel.tsx` - Hardware panel with optional silkscreen header slot
- `ui/src/components/ui/Input.tsx` - Inset mono/sans hardware text input
- `ui/src/components/ui/Select.tsx` - Inset hardware select dropdown
- `ui/src/components/ui/Tabs.tsx` - Segmented tab selector
- `ui/src/components/ui/Modal.tsx` - Flat modal with 1px hairline border, no shadow
- `ui/src/components/ui/Tooltip.tsx` - Accessible tooltip module
- `ui/src/components/ui/EmptyState.tsx` - Hardware empty state panel with icon, title, description, and action slot
- `ui/src/components/ui/index.ts` - Barrel exports for all primitives
- `ui/src/components/ui/primitives.test.tsx` - Unit tests for all 15 primitives
- `ui/src/components/transport/GlobalTransportBar.tsx` - Hardware transport strip restyled with ToggleKey, Readout, Fader, Segmented, KeyTile, and lucide-react icons
- `ui/src/features/library/LibraryView.tsx` - 36px table row height, silkscreen headers, KeyTile, 10-block Meter, live status LEDs, lucide-react icons, and tokenized styling

## Added Dependencies
- `@fontsource-variable/archivo`: Local UI font; semi-condensed width for dense tables without external CDN dependency.
- `@fontsource/ibm-plex-mono`: Local monospace font for tabular numbers, BPM, key, and readouts.
- `lucide-react`: Hardware icon set for buttons, transport, and library actions.

## Token List
### Surfaces (Warm neutral, no blue tint)
- `--surface-app`: `#121212` (Base application background)
- `--surface-panel`: `#1a1a1a` (Panel surface)
- `--surface-raised`: `#232323` (Hover and elevated elements)
- `--surface-hairline`: `#2e2e2e` (1px dividers and borders)
- `--surface-strong`: `#454545` (Active outlines and borders)

### Text (WCAG AA >= 4.5:1 on dark surfaces)
- `--text-primary`: `#ececec` (Contrast 14.8:1 on `#121212`)
- `--text-secondary`: `#b4b4b4` (Contrast 7.7:1 on `#121212`)
- `--text-muted`: `#8e8e8e` (Contrast 4.6:1 on `#121212`, captions only)

### Accent (Hot orange)
- `--accent`: `#ff5500` (Playhead, primary action, selection, focus outline)
- `--accent-hover`: `#ff6a22`
- `--accent-pressed`: `#e04a00`
- `--accent-text`: `#0e0e0e` (Contrast 9.1:1 on `#ff5500`)

### Status
- `--status-success`: `#5cd68a`
- `--status-warning`: `#f5c542`
- `--status-danger`: `#ff4d4d`
- `--status-info`: `#5aa9ff`

### Camelot Key Wheel (12 flat hues, minor deeper, major lighter, no accent orange)
- 1A/1B: `#00705a` / `#00b894` (Teal)
- 2A/2B: `#00688a` / `#00a8e8` (Cyan-Blue)
- 3A/3B: `#0048aa` / `#2277ff` (Blue)
- 4A/4B: `#2e35aa` / `#5965ff` (Indigo)
- 5A/5B: `#5822a8` / `#8c44ff` (Violet)
- 6A/6B: `#7e1a8a` / `#c038d4` (Magenta)
- 7A/7B: `#9e1260` / `#e82c94` (Rose)
- 8A/8B: `#aa1c30` / `#ea3950` (Crimson)
- 9A/9B: `#963800` / `#c85600` (Rust / Amber)
- 10A/10B: `#885400` / `#be7b00` (Ochre / Gold)
- 11A/11B: `#746e00` / `#ad9f00` (Olive / Lime-Yellow)
- 12A/12B: `#007238` / `#00af54` (Emerald Green)

### Energy Ramp (10-step, dim blue-gray to bright yellow, no accent orange)
- Level 1: `#2b3644` (Dim slate)
- Level 2: `#2d4554`
- Level 3: `#285660`
- Level 4: `#246663`
- Level 5: `#2f785b`
- Level 6: `#49884e`
- Level 7: `#6d9539`
- Level 8: `#9ba020`
- Level 9: `#caa712`
- Level 10: `#f5b700` (Bright yellow)

## Primitives in `ui/src/components/ui/`
1. `Button`: `primary`, `secondary`, `ghost`, `danger` variants with active pressed states.
2. `IconButton`: Accessible button with tooltip support and active states.
3. `ToggleKey`: Square hardware key with live LED indicator (`active`, `variant: default | accent`).
4. `Segmented`: Flat segmented control with 1px hairlines and keyboard navigation.
5. `Fader`: Hardware slider/fader with custom inset track and thumb.
6. `Meter`: Segmented LED meter (10 segments default) with customizable fill levels.
7. `Readout`: Inset hardware readout module with silkscreen caption and large mono value.
8. `KeyTile`: Camelot key badge styled with precise Camelot wheel color tokens.
9. `Panel`: Hairline bordered panel with silkscreen caption header.
10. `Input`: Inset mono or sans input with focus ring.
11. `Select`: Inset select dropdown with custom chevron and focus ring.
12. `Tabs`: Segmented tab list and panels.
13. `Modal`: Flat hardware modal with solid background, 1px hairline border, and focus trap.
14. `Tooltip`: Lightweight accessible hover/focus tooltip.
15. `EmptyState`: Empty state container with icon, title, description, and action button.

## Raw Hex Color Measurements
- **Owned files before**: 286 raw hex instances (50 in `GlobalTransportBar.tsx`, 236 in `LibraryView.tsx`).
- **Owned files after**: **0** raw hex instances across all owned files.
- **Whole app before**: 2,015 raw hex instances.
- **Whole app after**: 1,822 raw hex instances (193 eliminated).

## Tests
- `ui/src/components/ui/primitives.test.tsx`: 17 passed.
- `ui/src/components/transport/GlobalTransportBar.test.tsx`: 6 passed.
- `ui/src/features/library/*.test.tsx`: 47 passed (pure: 28, firstLaunch: 4, LibraryView: 15).
- Total tests in owned paths: **70 passed, 0 failed**.
- Rust tests: `cargo test --workspace` (294 passed, 0 failed).
- Rust clippy: `cargo clippy --workspace -- -D warnings` (passed, 0 warnings).
- Rust format: `cargo fmt --check` (passed).
- UI typecheck: `pnpm --dir ui typecheck` (`tsc -b --noEmit`, passed).

## Known Gaps
None in owned paths.

## Needs From Others
- Setlist workgroup: resolve `TransitionAdvice.summary` property reference in `ui/src/features/setlist/QuickSetModal.tsx` and export format label in `ui/src/features/setlist/SetlistView.test.tsx`.
