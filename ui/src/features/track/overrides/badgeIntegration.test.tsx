import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAppStore } from '../../../store/useAppStore';
import { mockBackend } from '../../../api';
import { LibraryView } from '../../library/LibraryView';
import { SortableTrackItem } from '../../setlist/SortableTrackItem';
import { StageMode } from '../../stage/StageMode';
import type { TrackWithOverrides } from '../../../api/overrides';
import type { SetlistEntry } from '../../../bindings/SetlistEntry';

// Mock resize observer for virtualized table
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

describe('Edited Badge Integration (Library Table, Setlist Rows, Stage Mode)', () => {
  let overriddenTrack: TrackWithOverrides;

  beforeEach(async () => {
    const tracks = await mockBackend.listTracks();
    const baseTrack = tracks[0];

    overriddenTrack = {
      ...baseTrack,
      overrides: {
        bpm: true,
        first_downbeat_ms: true,
        key_camelot: true,
        cues: false,
      },
    };

    useAppStore.setState({
      tracks: [overriddenTrack],
      selectedTrackId: overriddenTrack.id,
      selectedTrack: overriddenTrack,
      setlist: [
        {
          position: 1,
          track_id: overriddenTrack.id,
          track: overriddenTrack,
          transition: null,
          target_energy: 7,
        },
      ],
      currentRoute: 'library',
      hasLoadedTracks: true,
      isLoadingTracks: false,
    });
  });

  it('renders EDITED badges on overridden BPM and Key in LibraryView table', () => {
    render(<LibraryView />);

    const bpmBadge = screen.getByTestId('edited-badge-bpm');
    expect(bpmBadge).toBeDefined();
    expect(bpmBadge.textContent).toContain('EDITED');

    const keyBadge = screen.getByTestId('edited-badge-key_camelot');
    expect(keyBadge).toBeDefined();
    expect(keyBadge.textContent).toContain('EDITED');
  });

  it('renders EDITED badges on overridden BPM and Key in SortableTrackItem setlist row', () => {
    const entry: SetlistEntry = {
      position: 1,
      track_id: overriddenTrack.id,
      track: overriddenTrack,
      transition: null,
      target_energy: 7,
    };

    render(
      <SortableTrackItem
        entry={entry}
        isFirst={true}
        isLast={true}
        lockFirst={false}
        lockLast={false}
        onToggleLockFirst={() => {}}
        onToggleLockLast={() => {}}
        onRemove={() => {}}
        onInspect={() => {}}
      />
    );

    const bpmBadge = screen.getByTestId('edited-badge-bpm');
    expect(bpmBadge).toBeDefined();

    const keyBadge = screen.getByTestId('edited-badge-key_camelot');
    expect(keyBadge).toBeDefined();
  });

  it('renders EDITED badges on overridden BPM and Key in StageMode', () => {
    render(<StageMode />);

    const bpmBadge = screen.getByTestId('edited-badge-bpm');
    expect(bpmBadge).toBeDefined();

    const keyBadge = screen.getByTestId('edited-badge-key_camelot');
    expect(keyBadge).toBeDefined();
  });
});
