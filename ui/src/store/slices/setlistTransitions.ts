import type { AppState } from '../types';
import type { SetlistEntry } from '../../bindings/SetlistEntry';
import type { EnergyProfile } from '../../bindings/EnergyProfile';
import type { CostWeights } from '../../bindings/CostWeights';
import type { Backend } from '../../api';
import { getTargetEnergy, recalculateSetlistTargetEnergy } from '../../features/setlist/energyCurve';
import { scheduleActiveSetlistPersistence } from './setlistPersistence';

export async function resolveMissingTransitions(
  entries: SetlistEntry[],
  capturedVersion: number,
  profile: EnergyProfile,
  weights: CostWeights,
  backend: Backend,
  get: () => AppState,
  set: (updater: (state: AppState) => Partial<AppState> | Partial<AppState>) => void,
  customBackend?: Backend,
  recalculateEnergy?: boolean
): Promise<void> {
  const withTransitions = [...entries];
  let hasNewTransitions = false;

  for (let i = 1; i < withTransitions.length; i++) {
    if (get().setlistVersion !== capturedVersion) return;

    const prev = withTransitions[i - 1];
    const curr = withTransitions[i];
    if (!curr.transition && prev.track && curr.track) {
      try {
        const de =
          getTargetEnergy(profile, i, withTransitions.length) -
          getTargetEnergy(profile, i - 1, withTransitions.length);
        const transition = await backend.getAdvice(
          prev.track_id,
          curr.track_id,
          profile,
          weights,
          de
        );

        if (get().setlistVersion !== capturedVersion) return;

        withTransitions[i] = { ...curr, transition };
        hasNewTransitions = true;
      } catch {
        // ignore
      }
    }
  }

  if (hasNewTransitions && get().setlistVersion === capturedVersion) {
    const finalList = recalculateEnergy
      ? recalculateSetlistTargetEnergy(withTransitions, profile)
      : withTransitions;
    set(() => ({ setlist: finalList }));
    scheduleActiveSetlistPersistence(get, customBackend);
  }
}
