# F2 Design Tokens
Status: done
Changed: ui/src/index.css, ui/package.json, scripts/check-hex-tokens.js, scripts/migrate-hex-tokens.js, ui/src/utils/energyColor.ts, and 44 TSX view/component files across ui/src
Added deps: none
Public API: Design tokens defined in Tailwind theme (@theme in ui/src/index.css), check-hex-tokens lint script in typecheck pipeline.

## Token Table

| Role | Token Name | Value | Purpose |
|---|---|---|---|
| Deep Surface | `--color-surface-deep` | `#080808` | Background base / deep canvas recesses |
| Panel Surface | `--color-surface-panel` | `#0c0c10` | Default card & tool panels |
| Raised Surface | `--color-surface-raised` | `#141418` | Hoverable cards, active tracks, dropdown items |
| Elevated Surface | `--color-surface-elevated` | `#1a1a22` | Modals, popovers, elevated overlays |
| Hover Surface | `--color-surface-hover` | `#22222c` | Interactive item hover state |
| Subtle Border | `--color-border-subtle` | `#191922` | Hairline dividers |
| Base Border | `--color-border-base` | `#272732` | Standard card and input outlines |
| Strong Border | `--color-border-strong` | `#383844` | High-contrast borders, active container bounds |
| Focus Border | `--color-border-focus` | `#a1a1aa` | Keyboard focus ring outlines |
| Primary Text | `--color-content-primary` | `#ededed` | Main headers and active track titles |
| Secondary Text | `--color-content-secondary` | `#cfcfcf` | Body text, artists, labels |
| Muted Text | `--color-content-muted` | `--color-text-muted / #a8a8a8` | Subtitles, metadata, secondary readouts |
| Dim Text | `--color-content-dim` | `#666666` | Disabled states, timestamps, unit labels |
| Accent Amber | `--color-accent-amber` | `#f59e0b` | Studio hardware accent, primary action CTA |
| Accent Amber Hover | `--color-accent-amber-hover`| `#d97706` | Hover state for primary CTAs |
| Accent Amber Glow | `--color-accent-amber-glow` | `#fbbf24` | Active indicator glow |
| Accent Blue | `--color-accent-blue` | `#38bdf8` | Secondary action highlights, waveforms, active tabs |
| Accent Blue Dim | `--color-accent-blue-dim` | `#1e3a5f` | Secondary active states, subtle selection fills |
| Status Success | `--color-status-success` | `#10b981` | Safe transitions, completed scans, positive statuses |
| Status Warning | `--color-status-warning` | `#f59e0b` | Tempo shifts, moderate friction |
| Status Danger | `--color-status-danger` | `#ef4444` | Severe harmonic clash, missing files, errors |

## Tests & Lint Verification
- `scripts/check-hex-tokens.js` enforces zero hardcoded hex literals in TSX files outside allowlisted canvas/SVG graphics (e.g., WaveformCanvas, TopologyCanvas, EnergyChart) and Camelot color table.
- Integrated into `pnpm --dir ui typecheck`.
- Passes with 0 violations across all 44 modified TSX files.
- All 506 UI tests pass (`pnpm --dir ui test`).
- Typecheck passes cleanly (`pnpm --dir ui typecheck`).

## Known Gaps
- None.

## Needs From Others
- F3: Type scale and accessibility (contrast validation and typography).
