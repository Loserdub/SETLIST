import { useAppStore } from '../../store/useAppStore';

let initialNeedsReview = false;
const reviewFilterListeners = new Set<(active: boolean) => void>();

/**
 * Opens the library route with the "Needs review" filter enabled.
 * This can be directly called by the Start screen or any external navigation trigger.
 */
export function openLibraryWithReviewFilter(): void {
  initialNeedsReview = true;
  useAppStore.getState().setRoute('library');
  reviewFilterListeners.forEach((listener) => {
    try {
      listener(true);
    } catch (err) {
      console.error('Error executing review filter listener:', err);
    }
  });
}

/**
 * Subscribes to external review filter activation signals.
 * @internal
 */
export function subscribeToReviewFilter(callback: (active: boolean) => void): () => void {
  reviewFilterListeners.add(callback);
  return () => {
    reviewFilterListeners.delete(callback);
  };
}

/**
 * Consumes the one-time initial needs review flag on component mount.
 * @internal
 */
export function consumeInitialNeedsReview(): boolean {
  const val = initialNeedsReview;
  initialNeedsReview = false;
  return val;
}
