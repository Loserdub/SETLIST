//! Energy profile models and target energy trajectory functions.
//!
//! Implements energy profiles described in AGENTS.md Section 6.4:
//! - Linear ramp: energy rises steadily across the set, never drops.
//! - Wave: alternates peaks and valleys.
//! - Peak plateau: reaches high energy early and holds it.

use core_types::EnergyProfile;

/// Calculates the target energy level (on scale 1.0 to 10.0) at position `k` of `n` tracks.
///
/// `k` is the 0-based track position in the setlist (`0 <= k < n`).
/// If `n <= 1`, returns a default mid/high energy based on the profile.
#[must_use]
pub fn target_energy(profile: EnergyProfile, k: usize, n: usize) -> f32 {
    if n <= 1 {
        return match profile {
            EnergyProfile::LinearRamp | EnergyProfile::Wave => 5.0,
            EnergyProfile::PeakPlateau => 8.5,
        };
    }

    let clamped_k = k.min(n - 1);
    let t = (clamped_k as f32) / ((n - 1) as f32);

    match profile {
        EnergyProfile::LinearRamp => {
            // Linear ramp from 4.0 to 9.0. Energy rises steadily and never drops.
            4.0 + 5.0 * t
        }
        EnergyProfile::Wave => {
            // Alternates peaks and valleys:
            // Starts at 3.5, peaks at t = 0.25 (8.6), dips to valley at t = 0.5 (3.75),
            // peaks again at t = 0.75 (8.9), and cools down at t = 1.0 (4.0).
            let base = 6.0 + 0.5 * t;
            let oscillation = -2.5 * (4.0 * std::f32::consts::PI * t).cos();
            (base + oscillation).clamp(1.0, 10.0)
        }
        EnergyProfile::PeakPlateau => {
            // Reaches high energy (8.5) early (by t = 0.25) and holds it.
            let ramp_fraction = 0.25;
            if t <= ramp_fraction {
                4.0 + (8.5 - 4.0) * (t / ramp_fraction)
            } else {
                8.5
            }
        }
    }
}

/// Calculates the expected energy change `dE_target` at position `k` of `n` tracks.
///
/// This is the expected change from position `k` to `k + 1`:
/// `target_energy(profile, k + 1, n) - target_energy(profile, k, n)`.
/// Returns 0.0 for the last position (`k + 1 >= n`) or when `n <= 1`.
#[must_use]
pub fn de_target(profile: EnergyProfile, k: usize, n: usize) -> f32 {
    if n <= 1 || k + 1 >= n {
        0.0
    } else {
        target_energy(profile, k + 1, n) - target_energy(profile, k, n)
    }
}

/// Alias for [`de_target`] preserving casing from AGENTS.md Section 6.4.
#[allow(non_snake_case)]
#[must_use]
pub fn dE_target(profile: EnergyProfile, k: usize, n: usize) -> f32 {
    de_target(profile, k, n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_linear_ramp_shape() {
        let n = 20;
        let mut prev_energy = target_energy(EnergyProfile::LinearRamp, 0, n);
        assert!((prev_energy - 4.0).abs() < 1e-4);

        for k in 1..n {
            let energy = target_energy(EnergyProfile::LinearRamp, k, n);
            assert!(
                energy >= prev_energy,
                "Linear ramp energy dropped at k={k}: {energy} < {prev_energy}"
            );
            let de = dE_target(EnergyProfile::LinearRamp, k - 1, n);
            assert!(
                de >= 0.0,
                "Linear ramp dE_target must be non-negative: {de}"
            );
            prev_energy = energy;
        }

        let final_energy = target_energy(EnergyProfile::LinearRamp, n - 1, n);
        assert!((final_energy - 9.0).abs() < 1e-4);
        assert_eq!(dE_target(EnergyProfile::LinearRamp, n - 1, n), 0.0);
    }

    #[test]
    fn test_wave_shape() {
        let n = 41; // 0, 10, 20, 30, 40 map exactly to t = 0.0, 0.25, 0.5, 0.75, 1.0

        let e_start = target_energy(EnergyProfile::Wave, 0, n);
        let e_peak1 = target_energy(EnergyProfile::Wave, 10, n);
        let e_valley = target_energy(EnergyProfile::Wave, 20, n);
        let e_peak2 = target_energy(EnergyProfile::Wave, 30, n);
        let e_end = target_energy(EnergyProfile::Wave, 40, n);

        // Verify alternate peaks and valleys
        assert!(e_peak1 > e_start, "Peak 1 must be higher than start");
        assert!(e_valley < e_peak1, "Valley must dip below Peak 1");
        assert!(e_peak2 > e_valley, "Peak 2 must rise above Valley");
        assert!(e_end < e_peak2, "End must dip below Peak 2");

        // Verify slope sign changes (peaks and valleys)
        let mut slope_changes = 0;
        let mut prev_sign: Option<bool> = None; // true for positive, false for negative

        for k in 0..(n - 1) {
            let de = dE_target(EnergyProfile::Wave, k, n);
            if de.abs() > 1e-5 {
                let current_sign = de > 0.0;
                if let Some(prev) = prev_sign {
                    if prev != current_sign {
                        slope_changes += 1;
                    }
                }
                prev_sign = Some(current_sign);
            }
        }

        // 2 cycles will have at least 3 slope inflection points (peak1, valley, peak2)
        assert!(
            slope_changes >= 3,
            "Wave must oscillate with at least 3 slope changes, got {slope_changes}"
        );
    }

    #[test]
    fn test_peak_plateau_shape() {
        let n = 21; // k=0..20, t=k/20
        let ramp_end_k = 5; // t = 5/20 = 0.25

        // Initial rise
        let e_start = target_energy(EnergyProfile::PeakPlateau, 0, n);
        let e_plateau = target_energy(EnergyProfile::PeakPlateau, ramp_end_k, n);
        assert!((e_start - 4.0).abs() < 1e-4);
        assert!((e_plateau - 8.5).abs() < 1e-4);

        // Verify steady climb during ramp
        for k in 0..ramp_end_k {
            let e = target_energy(EnergyProfile::PeakPlateau, k, n);
            let next_e = target_energy(EnergyProfile::PeakPlateau, k + 1, n);
            assert!(next_e > e, "Must rise during ramp: k={k}");
            let de = dE_target(EnergyProfile::PeakPlateau, k, n);
            assert!(de > 0.0, "dE must be positive during ramp: {de}");
        }

        // Verify flat plateau holding high energy
        for k in ramp_end_k..n {
            let e = target_energy(EnergyProfile::PeakPlateau, k, n);
            assert!(
                (e - 8.5).abs() < 1e-4,
                "Plateau energy must hold at 8.5 at k={k}, got {e}"
            );
            let de = dE_target(EnergyProfile::PeakPlateau, k, n);
            assert_eq!(de, 0.0, "dE must be zero on plateau at k={k}");
        }
    }

    #[test]
    fn test_boundary_and_single_track() {
        for profile in [
            EnergyProfile::LinearRamp,
            EnergyProfile::Wave,
            EnergyProfile::PeakPlateau,
        ] {
            assert!(target_energy(profile, 0, 1) >= 1.0);
            assert_eq!(dE_target(profile, 0, 1), 0.0);
            assert_eq!(dE_target(profile, 5, 2), 0.0);
        }
    }
}
