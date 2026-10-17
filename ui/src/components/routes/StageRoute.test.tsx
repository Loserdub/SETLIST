import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StageRoute } from './StageRoute';
import { useAppStore } from '../../store/useAppStore';
import * as stageFlag from '../../config/stageFeatureFlag';

describe('StageRoute Quarantined Routing Boundary', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentRoute: 'stage',
      isStageMode: true,
      setlist: [],
    });
  });

  it('renders quarantined boundary screen and allows return to studio when feature flag is disabled', () => {
    vi.spyOn(stageFlag, 'isStageModeEnabled').mockReturnValue(false);

    render(<StageRoute />);

    expect(screen.getByTestId('stage-quarantined')).toBeDefined();
    expect(screen.getByText('Stage Mode Quarantined')).toBeDefined();

    const returnBtn = screen.getByTestId('quarantine-exit-btn');
    fireEvent.click(returnBtn);

    expect(useAppStore.getState().currentRoute).toBe('setlist');
    expect(useAppStore.getState().isStageMode).toBe(false);
  });

  it('renders StageMode when feature flag is enabled', () => {
    vi.spyOn(stageFlag, 'isStageModeEnabled').mockReturnValue(true);

    render(<StageRoute />);

    expect(screen.queryByTestId('stage-quarantined')).toBeNull();
    // Empty setlist renders stage-empty
    expect(screen.getByTestId('stage-empty')).toBeDefined();
  });
});
