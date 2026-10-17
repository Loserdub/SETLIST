/**
 * Stage Mode Quarantine & Developer Feature Flag Configuration.
 *
 * SETLIST Architecture Rule:
 * Studio Mode (Static Setlist & Sequencing) is strictly decoupled from the live performance engine.
 * Stage Mode and live-deck components are quarantined behind this feature flag so they cannot
 * pollute the studio environment or global store during DJ set preparation.
 */

let stageModeOverride: boolean | null = null;

/**
 * Programmatically overrides the ENABLE_STAGE_MODE feature flag (useful in tests and dev tools).
 * Pass `null` to reset back to environment default.
 */
export const setEnableStageMode = (enabled: boolean | null): void => {
  stageModeOverride = enabled;
  if (typeof window !== 'undefined') {
    const win = window as unknown as { __ENABLE_STAGE_MODE__?: boolean | null };
    win.__ENABLE_STAGE_MODE__ = enabled;
  }
};

/**
 * Resets any active programmatic or window override for the ENABLE_STAGE_MODE feature flag.
 */
export const resetStageModeFeatureFlag = (): void => {
  stageModeOverride = null;
  if (typeof window !== 'undefined') {
    const win = window as unknown as { __ENABLE_STAGE_MODE__?: boolean | null };
    delete win.__ENABLE_STAGE_MODE__;
  }
};

export const isStageModeEnabled = (): boolean => {
  // 1. Programmatic in-memory override
  if (stageModeOverride !== null) {
    return stageModeOverride;
  }

  // 2. Global window flag (runtime developer override)
  if (typeof window !== 'undefined') {
    const win = window as unknown as { __ENABLE_STAGE_MODE__?: boolean };
    if (typeof win.__ENABLE_STAGE_MODE__ === 'boolean') {
      return win.__ENABLE_STAGE_MODE__;
    }
  }

  // 3. Vite environment variable flag
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (
      import.meta.env.VITE_ENABLE_STAGE_MODE !== undefined &&
      import.meta.env.VITE_ENABLE_STAGE_MODE !== 'false' &&
      import.meta.env.VITE_ENABLE_STAGE_MODE !== '0'
    ) {
      return true;
    }
    if (
      import.meta.env.VITE_SHOW_DEV_TOOLS &&
      import.meta.env.VITE_SHOW_DEV_TOOLS !== 'false' &&
      import.meta.env.VITE_SHOW_DEV_TOOLS !== '0'
    ) {
      return true;
    }
    // Allow stage mode during automated vitest test suites if not explicitly overridden
    if (import.meta.env.MODE === 'test') {
      return true;
    }
  }
  return false;
};

export const isStageModeQuarantined = (): boolean => {
  return !isStageModeEnabled();
};
