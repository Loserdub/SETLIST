import { useEffect, useCallback } from 'react';

/**
 * Default key bindings for stage navigation.
 * Designed to support common Bluetooth foot pedals (which often send
 * PageDown/PageUp, arrow keys, or Space) as well as standard keyboard input.
 */
export const DEFAULT_KEY_BINDINGS = {
  next: ['ArrowRight', 'ArrowDown', 'PageDown', ' '],
  prev: ['ArrowLeft', 'ArrowUp', 'PageUp'],
  exit: ['Escape'],
} as const;

export interface StageKeyBindings {
  next: readonly string[];
  prev: readonly string[];
  exit: readonly string[];
}

interface UseStageKeyboardOptions {
  active: boolean;
  onNext: () => void;
  onPrev: () => void;
  onExit: () => void;
  onTogglePlayMode?: () => void;
  onSelectBranch?: (branch: 1 | 2 | 3) => void;
  bindings?: StageKeyBindings;
}

/**
 * Keyboard navigation hook for Stage Mode.
 * Captures keyboard events and maps them to navigation actions.
 * Supports configurable key bindings for foot pedal compatibility.
 */
export function useStageKeyboard({
  active,
  onNext,
  onPrev,
  onExit,
  onTogglePlayMode,
  onSelectBranch,
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

      // Tactical Crossroads Shortcuts
      if (e.key === '1' && onSelectBranch) {
        e.preventDefault();
        onSelectBranch(1);
        return;
      }
      if (e.key === '2' && onSelectBranch) {
        e.preventDefault();
        onSelectBranch(2);
        return;
      }
      if (e.key === '3' && onSelectBranch) {
        e.preventDefault();
        onSelectBranch(3);
        return;
      }

      // Auto-Advance toggle shortcut ('A' or 'a')
      if ((e.key === 'a' || e.key === 'A') && onTogglePlayMode) {
        e.preventDefault();
        onTogglePlayMode();
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
    },
    [onNext, onPrev, onExit, onTogglePlayMode, onSelectBranch, bindings]
  );

  useEffect(() => {
    if (!active) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [active, handleKeyDown]);
}
