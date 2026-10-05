import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isWindowFullscreen,
  setWindowFullscreen,
  toggleWindowFullscreen,
} from './windowFullscreen';

describe('windowFullscreen Utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checks fullscreen state in web fallback mode', async () => {
    const isFull = await isWindowFullscreen();
    expect(isFull).toBe(false);
  });

  it('toggles fullscreen state via HTML5 fallback API', async () => {
    const reqFullscreenMock = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = reqFullscreenMock;

    const result = await setWindowFullscreen(true);
    expect(result).toBe(true);
    expect(reqFullscreenMock).toHaveBeenCalled();
  });

  it('exits fullscreen via HTML5 fallback API', async () => {
    const exitFullscreenMock = vi.fn().mockResolvedValue(undefined);
    document.exitFullscreen = exitFullscreenMock;
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.documentElement,
      configurable: true,
      writable: true,
    });

    const isFull = await isWindowFullscreen();
    expect(isFull).toBe(true);

    const result = await setWindowFullscreen(false);
    expect(result).toBe(false);
    expect(exitFullscreenMock).toHaveBeenCalled();

    // Reset
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      configurable: true,
      writable: true,
    });
  });

  it('toggles window fullscreen smoothly', async () => {
    const reqFullscreenMock = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = reqFullscreenMock;

    const next = await toggleWindowFullscreen();
    expect(next).toBe(true);
  });
});
