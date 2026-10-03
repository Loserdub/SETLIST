import { useEffect, useRef, useState } from 'react';

/**
 * Manages the Screen Wake Lock API lifecycle.
 * Acquires a wake lock when `active` is true, releases it when false.
 * Handles visibility changes (re-acquire on tab refocus) and
 * gracefully degrades when the API is unavailable.
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const [isSupported] = useState(() => 'wakeLock' in navigator);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !isSupported) {
      // Release existing lock if deactivating
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
        setIsActive(false);
      }
      return;
    }

    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        setIsActive(true);
        setError(null);

        sentinel.addEventListener('release', () => {
          if (!cancelled) {
            setIsActive(false);
            sentinelRef.current = null;
          }
        });
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          setIsActive(false);
        }
      }
    };

    acquire();

    // Re-acquire on visibility change (browser releases wake lock on tab hide)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled && !sentinelRef.current) {
        acquire();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
        setIsActive(false);
      }
    };
  }, [active, isSupported]);

  return { isSupported, isActive, error };
}
