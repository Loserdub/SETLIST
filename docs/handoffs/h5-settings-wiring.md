# h5-settings-wiring Settings Route Wiring & Real Cost Model Customization
Status: done

Changed:
- `src-tauri/src/commands.rs`:
  - In `suggest_order_pins_core`:
    - Loaded `AppSettings` from the database.
    - Constructed `CostModelConfig::from_app_settings(&settings)`.
    - Applied UI-passed `weights` if provided (`weights.unwrap_or(settings.cost_weights)`), falling back to database-persisted `cost_weights`.
    - Called `sequencer::order_tracks_with_config(&analyses, &active_weights, active_profile, &pins, seed, Some(&cost_config))`.
    - Called `sequencer::advise_transition_with_cost_and_config` with `Some(&cost_config)` and `Some(active_weights)` when calculating adjacent transition advice for the resulting setlist entries.
  - In `get_advice_core`:
    - Loaded `AppSettings` from the database.
    - Constructed `CostModelConfig::from_app_settings(&settings)`.
    - Resolved active weights via `weights.unwrap_or(settings.cost_weights)`.
    - Called `sequencer::advise_transition_with_cost_and_config` with `Some(&cost_config)` and `Some(active_weights)`.
  - Preserved all H1 pin constraints (`first_id`, `last_id`) and `ScanGuard` RAII lifecycle guarantees untouched.
- `src-tauri/tests/settings_wiring_test.rs`:
  - Added integration tests covering custom key penalty table persistence affecting costs in `get_advice` and `suggest_order`, default settings determinism matching reference costs/ordering, and database weight fallback when no weights are passed.

Added deps: none

Public API:
- `app_lib::commands::suggest_order_pins_core(state, track_ids, profile, weights, first_id, last_id, on_progress) -> Result<Vec<SetlistEntry>, String>`
- `app_lib::commands::suggest_order_core(state, track_ids, profile, weights, on_progress) -> Result<Vec<SetlistEntry>, String>`
- `app_lib::commands::get_advice_core(state, track_a_id, track_b_id, profile, weights, de_target) -> Result<TransitionAdvice, String>`

UI Request Payload Analysis:
- `useAppStore.ts` and `SetlistView.tsx` invoke `suggestOrder` passing `(trackIds, energyProfile, costWeights)`.
- `costWeights` in frontend store state defaults to `{ w_tempo: 0.30, w_key: 0.35, w_energy: 0.35, w_timbre: 0.00 }`.
- When `weights` are passed from the UI, `commands.rs` uses the caller-provided `weights`. When `weights` are `None` (such as in headless calls, scripts, or default mock paths), `commands.rs` uses the database-persisted weights from `AppSettings.cost_weights`.

EnergyModelSettings.target_step Usage Report:
- `EnergyModelSettings.target_step` is defined in `crates/core-types/src/types.rs`, persisted in SQLite via `library-db`, and bound to the UI on `SettingsRoute.tsx` (default `1.5`).
- **Consumer status**: Nothing in the current codebase consumes `target_step` for calculation (the sequencer evaluates energy curves according to AGENTS.md Section 6.4 formulas and `dE_target(profile, pos, total)`). No synthetic or invented consumption was added.

Tests:
- `src-tauri/tests/settings_wiring_test.rs`:
  - `test_default_settings_give_deterministic_order_and_standard_cost`
  - `test_custom_key_penalties_change_cost_in_get_advice_and_suggest_order`
  - `test_saved_cost_weights_and_energy_divisor_are_applied_when_no_weights_passed`
- `cargo test --workspace` (all 149+ unit, integration, and doc tests PASS)
- `cargo clippy --workspace --all-targets -- -D warnings` (PASS)
- `cargo fmt --check` (PASS)
- `pnpm --dir ui typecheck` (PASS)
- `pnpm --dir ui test` (PASS)
- `pnpm tauri build --bundles nsis` (PASS)

Known gaps: none
Needs from others: none
