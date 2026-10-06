/**
 * Domain-modular API layer for SETLIST by TRUSTNODELOGIC.
 * Re-exports typed Backend interfaces, domain converters, mock simulation data,
 * and native Tauri IPC bindings.
 */

import type { Backend } from './types';
import { mockBackend } from './mockBackend';
import { tauriBackend } from './tauriBackend';

// Export domain types
export * from './types';

// Export domain model converters
export * from './converters';

// Export mock dataset and simulation stores
export * from './mockData';

// Export mock discovery and relationship evaluators
export * from './mockDiscovery';

// Export backend implementations
export { mockBackend } from './mockBackend';
export {
  tauriBackend,
  setBackendToastHandler,
  turnBackendErrorToToast,
  emitBackendErrorToast,
  invokeSafe,
} from './tauriBackend';

// Re-export friendly error types and helpers
export { mapBackendError, formatFriendlyToast, type FriendlyError } from '../utils/errors';

// Global flag to select between mock and Tauri backends (default: Tauri native)
export let USE_MOCK_BACKEND = false;

export function setUseMockBackend(useMock: boolean): void {
  USE_MOCK_BACKEND = useMock;
}

/**
 * Returns whether the application is running inside a native Tauri runtime window.
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Returns the active backend instance based on the selection flag.
 */
export function getBackend(useMock: boolean = USE_MOCK_BACKEND): Backend {
  return useMock ? mockBackend : tauriBackend;
}
