//! Clock trait and implementations for real-time and simulated playback timing.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

/// Trait abstracting time measurement for the playback state machine.
///
/// Implementations must be thread-safe (`Send + Sync`) and deterministic when using
/// synthetic or simulated clocks.
pub trait Clock: Send + Sync + 'static {
    /// Returns the current timestamp as a [`Duration`] from an arbitrary fixed baseline.
    fn now(&self) -> Duration;
}

/// System wall-clock implementation using [`std::time::Instant`].
#[derive(Debug)]
pub struct SystemClock {
    epoch: Instant,
}

impl Default for SystemClock {
    fn default() -> Self {
        Self {
            epoch: Instant::now(),
        }
    }
}

impl SystemClock {
    /// Creates a new system clock whose origin is the current moment.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }
}

impl Clock for SystemClock {
    fn now(&self) -> Duration {
        self.epoch.elapsed()
    }
}

/// Simulated clock for deterministic automated tests.
///
/// Time advances only when explicitly manipulated via [`FakeClock::advance`]
/// or [`FakeClock::advance_ms`].
#[derive(Debug, Default)]
pub struct FakeClock {
    current_micros: AtomicU64,
}

impl FakeClock {
    /// Creates a new fake clock initialized at zero.
    #[must_use]
    pub fn new() -> Self {
        Self {
            current_micros: AtomicU64::new(0),
        }
    }

    /// Advances the fake clock by the specified [`Duration`].
    pub fn advance(&self, duration: Duration) {
        let micros = u64::try_from(duration.as_micros()).unwrap_or(u64::MAX);
        self.current_micros.fetch_add(micros, Ordering::SeqCst);
    }

    /// Advances the fake clock by milliseconds as `f64`.
    pub fn advance_ms(&self, ms: f64) {
        if ms > 0.0 {
            let micros = (ms * 1000.0).round() as u64;
            self.current_micros.fetch_add(micros, Ordering::SeqCst);
        }
    }

    /// Explicitly sets the clock's current time in microseconds.
    pub fn set_micros(&self, micros: u64) {
        self.current_micros.store(micros, Ordering::SeqCst);
    }
}

impl Clock for FakeClock {
    fn now(&self) -> Duration {
        Duration::from_micros(self.current_micros.load(Ordering::SeqCst))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_clock_advances() {
        let clock = SystemClock::new();
        let t1 = clock.now();
        std::thread::sleep(Duration::from_millis(10));
        let t2 = clock.now();
        assert!(t2 >= t1);
    }

    #[test]
    fn test_fake_clock_manual_advance() {
        let clock = FakeClock::new();
        assert_eq!(clock.now(), Duration::ZERO);

        clock.advance(Duration::from_millis(250));
        assert_eq!(clock.now(), Duration::from_millis(250));

        clock.advance_ms(150.5);
        assert_eq!(clock.now().as_micros(), 400_500);

        clock.set_micros(1_000_000);
        assert_eq!(clock.now(), Duration::from_secs(1));
    }
}
