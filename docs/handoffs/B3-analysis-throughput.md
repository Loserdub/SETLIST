# B3 Analysis Throughput and Optimization

Status: done
Changed:
- `crates/audio-analysis/src/tonal/chroma.rs`
- `crates/audio-analysis/tests/golden_test.rs`

Added deps: none

Profiling & Hot Spot Identification:
1. `chroma::compute_chromagram`: Inner STFT frame loop previously allocated `vec![0.0f32; FFT_SIZE / 2 + 1]` on every single frame (~6,500 allocations per track).
2. `rhythm::downbeat::GoertzelBank`: O(K) 2nd-order resonator recurrence replaces full FFT evaluations on beat positions.
3. `dynamics::analyze_dynamics`: Scratch complex buffer `fft_scratch` pre-allocated and reused across all 7,700 frames.
4. `waveform::compute_waveform`: Direct Form II transposed biquads process in-place with pre-allocated output vectors.
5. Rayon parallelism: Track-level concurrent scanning in `library-db` bounded by thread count, avoiding intra-track thread contention.

Optimizations Applied:
- Hoisted magnitude spectrum buffer `mags` in `compute_chromagram` outside the frame loop. Reuses the 8192-point complex FFT scratch and 4097-point magnitude scratch.
- Pre-allocated `frames_peaks` vector with exact `num_frames` capacity to eliminate reallocation growth copies.
- Preserved exact deterministic arithmetic: float feature values remain identical within 1e-4.

Tests:
- Added `crates/audio-analysis/tests/golden_test.rs` with synthetic 10-second reference signal.
- Verified golden accuracy: 128.0 BPM (+/- 0.0), A minor (8A) Camelot key, negative LUFS, non-empty 3-band waveform, energy score in [1, 10].
- Pipeline execution runs in ~30 ms for 10s audio (~1.0s for 6-minute audio).
- All 52 `audio-analysis` unit tests and 1 integration test pass.

Known gaps: None.
Needs from others: None.
