/**
 * Energy score color palette utility.
 * Maps 1-10 energy scores to calibrated performance alert colors.
 */
export function getEnergyColor(energy: number): string {
  if (energy >= 8) return '#e11d48'; // High energy rose/red
  if (energy >= 5) return '#d97706'; // Mid energy amber
  return '#059669'; // Low energy emerald
}
