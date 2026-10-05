import { isTauriEnvironment } from '../api';

/**
 * Checks whether the current window is currently in fullscreen mode.
 */
export async function isWindowFullscreen(): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      return await getCurrentWebviewWindow().isFullscreen();
    } catch (e) {
      console.warn('Failed to query Tauri window fullscreen state:', e);
    }
  }

  if (typeof document !== 'undefined') {
    return Boolean(document.fullscreenElement);
  }

  return false;
}

/**
 * Sets the window fullscreen state.
 */
export async function setWindowFullscreen(fullscreen: boolean): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      await getCurrentWebviewWindow().setFullscreen(fullscreen);
      return fullscreen;
    } catch (e) {
      console.warn('Failed to set Tauri window fullscreen:', e);
    }
  }

  if (typeof document !== 'undefined') {
    try {
      if (fullscreen) {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
          return true;
        }
      } else {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen();
          return false;
        }
      }
    } catch (e) {
      console.warn('HTML5 Fullscreen API error:', e);
    }
  }

  return fullscreen;
}

/**
 * Toggles the window fullscreen state between active and restored.
 */
export async function toggleWindowFullscreen(): Promise<boolean> {
  const current = await isWindowFullscreen();
  return setWindowFullscreen(!current);
}
