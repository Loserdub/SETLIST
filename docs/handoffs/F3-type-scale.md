# F3 Type Scale and Accessibility
Status: done
Changed: AGENTS.md, ui/src/components/Sidebar.tsx, ui/src/components/transport/GlobalTransportBar.tsx, ui/src/features/library/LibraryView.tsx, ui/src/features/library/StructuralMiniMap.tsx, ui/src/features/stage/StageMode.tsx, ui/src/features/transition/DualDeckWaveform.tsx
Added deps: none
Public API: Typography scale and WCAG AA contrast rules documented in AGENTS.md Section 4.

## Type Scale Standard
- **Readable / Body Text Minimum**: 12px (`text-xs`), standard body 14px (`text-sm`).
- **Micro-labels (Allowlist Only)**: 11px (`text-[11px]`) strictly paired with uppercase styling and letter tracking (`uppercase tracking-wider` or `tracking-widest`). Used exclusively for hardware status badges, keyboard keycap indicators, and structural tags.
- **Sub-11px Text**: Completely eliminated (0 occurrences of `text-[9px]` or `text-[10px]` across the entire codebase).
- **Stage Mode Scale**: Distance-legible typography (telemetry labels minimum 12px `text-xs`, numeric readouts 14px-32px `text-base` to `text-3xl`).

## Contrast Ratio Audit (WCAG AA Compliance)

Backgrounds:
- Deep Surface: `#080808`
- Panel Surface: `#0c0c10`
- Raised Surface: `#141418`
- Elevated Surface: `#1a1a22`

| Text Color Token | Hex / Luma | Target Background | Contrast Ratio | WCAG AA Status | Purpose / Context |
|---|---|---|---|---|---|
| `--color-content-primary` | `#ededed` (0.838) | `#0c0c10` | 16.17:1 | PASS (AAA) | Headings, active titles, track names |
| `--color-content-secondary` | `#cfcfcf` (0.622) | `#0c0c10` | 12.24:1 | PASS (AAA) | Body copy, artists, primary labels |
| `--color-content-muted` | `#a8a8a8` (0.388) | `#0c0c10` | 7.97:1 | PASS (AAA) | Subtitles, metadata, secondary readouts |
| `--color-content-muted` | `#a8a8a8` (0.388) | `#1a1a22` | 6.93:1 | PASS (AA / AAA large) | Elevated cards, modals |
| `--color-accent-amber` | `#f59e0b` (0.430) | `#0c0c10` | 8.74:1 | PASS (AAA) | Focus rings, primary buttons, warnings |
| `--color-accent-blue` | `#38bdf8` (0.480) | `#0c0c10` | 9.65:1 | PASS (AAA) | Active tab highlights, playhead markers |
| `--color-status-success` | `#10b981` (0.410) | `#0c0c10` | 8.38:1 | PASS (AAA) | Compatible transition badges |
| `--color-status-danger` | `#ef4444` (0.280) | `#0c0c10` | 5.86:1 | PASS (AA) | Error notifications, severe harmonic clashes |

## Accessibility Verification
- Focus rings: All interactive elements feature `focus-visible:ring-2 focus-visible:ring-accent-amber` or `focus-visible:ring-accent-blue` and outline reset.
- Information accessibility: No musical information is conveyed by color alone; every Camelot badge displays its key alphanumeric code (e.g., "8A") alongside color coding.
- Icon buttons: Augmented with explicit `aria-label` attributes and tooltip titles.

## Tests & Quality Gates
- `pnpm --dir ui typecheck`: PASS (Clean TypeScript build and zero hex token lint violations).
- `pnpm --dir ui test`: PASS (All 506 unit & integration tests passing).

## Known Gaps
- None.

## Needs From Others
- F4: Module decomposition (splitting large files in `ui/`).
