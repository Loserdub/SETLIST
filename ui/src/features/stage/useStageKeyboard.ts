import { useEffect, useCallback } from 'react';

/**
 * Default key bindings for stage navigation.
 * Designed to support common Bluetooth foot pedals (which often send
 * PageDown/PageUp, arrow keys, or Space) as well as standard keyboard input.
 */
export const DEFAULT_KEY_BINDINGS = {
  next: ['ArrowRight', 'ArrowDown', 'PageDown', 'Enter'],
  prev: ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'],
  exit: ['Escape'],
  toggleSetlist: ['s', 'S'],
  playPause: [' '],
  cues: ['1', '2', '3', '4'],
} as const;

export interface StageKeyBindings {
  next: readonly string[];
  prev: readonly string[];
  exit: readonly string[];
  toggleSetlist?: readonly string[];
  playPause?: readonly string[];
  cues?: readonly string[];
}

interface UseStageKeyboardOptions {
  active: boolean;
  onNext: () => void;
  onPrev: () => void;
  onExit: () => void;
  onToggleSetlist?: () => void;
  onPlayPause?: () => void;
  onCue?: (slot: 'A' | 'B' | 'C' | 'D') => void;
  bindings?: StageKeyBindings;
}

/**
 * Keyboard navigation hook for Stage Mode.
 * Captures keyboard events and maps them to navigation actions.
 * Supports configurable key bindings for foot pedal compatibility and DAW-style transport.
 */
export function useStageKeyboard({
  active,
  onNext,
  onPrev,
  onExit,
  onToggleSetlist,
  onPlayPause,
  onCue,
  bindings = DEFAULT_KEY_BINDINGS,
}: UseStageKeyboardOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (bindings.playPause?.includes(e.key) && onPlayPause) {
        e.preventDefault();
        onPlayPause();
        return;
      }
      if (bindings.next.includes(e.key)) {
        e.preventDefault();
        onNext();
        return;
      }
      if (bindings.prev.includes(e.key)) {
        e.preventDefault();
        onPrev();
        return;
      }
      if (bindings.exit.includes(e.key)) {
        e.preventDefault();
        onExit();
        return;
      }
      if (bindings.toggleSetlist && bindings.toggleSetlist.includes(e.key) && onToggleSetlist) {
        e.preventDefault();
        onToggleSetlist();
        return;
      }
      if (bindings.cues?.includes(e.key) && onCue) {
        e.preventDefault();
        const map: Record<string, 'A' | 'B' | 'C' | 'D'> = {
          '1': 'A',
          '2': 'B',
          '3': 'C',
          '4': 'D',
        };
        const slot = map[e.key];
        if (slot) onCue(slot);
        return;
      }
    },
    [onNext, onPrev, onExit, onToggleSetlist, onPlayPause, onCue, bindings]
  );

  useEffect(() => {
    if (!active) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, handleKeyDown]);
}
