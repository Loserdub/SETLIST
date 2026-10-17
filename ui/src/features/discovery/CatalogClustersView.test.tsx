import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CatalogClustersView } from './CatalogClustersView';
import type { Song } from '../../bindings/Song';
import * as api from '../../api';

describe('CatalogClustersView', () => {
  it('falls back to fullSong metadata when outlier title/artist/bpm/key are unknown or missing', async () => {
    const mockOutlier = {
      song_id: 'song-123',
      title: 'Unknown Title',
      artist: 'Unknown Artist',
      strong_connection_count: 0,
      total_viable_count: 1,
      max_compatibility_score: 0.45,
      bpm: null,
      camelot_code: null,
      energy_rating: null,
      reasons: ['No strong harmonic transitions found.'],
    };

    const mockSongs: Song[] = [
      {
        id: 'song-123',
        title: 'Deep In The Night',
        artist: 'Solaris',
        duration_seconds: 210,
        bpm: 126.0,
        musical_key: '5A',
        mode: 'Minor',
        camelot_code: '5A',
        tuning: 'Standard',
        capo: 0,
        energy_rating: 7,
        lead_performer: 'Solaris',
        tags: [],
        notes: null,
      },
    ];

    const mockBackend = {
      ...api.mockBackend,
      getCatalogClusters: vi.fn().mockResolvedValue([]),
      getCatalogOutliers: vi.fn().mockResolvedValue([mockOutlier]),
    };

    vi.spyOn(api, 'getBackend').mockReturnValue(mockBackend);

    const onSelectSong = vi.fn();

    render(
      <CatalogClustersView
        songs={mockSongs}
        onSelectSong={onSelectSong}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('outlier-card-song-123')).toBeDefined();
    });

    // Verify resolved title and artist from fullSong
    expect(screen.getByText('Deep In The Night')).toBeDefined();
    expect(screen.getByText('Solaris')).toBeDefined();
    expect(screen.queryByText('Unknown Title')).toBeNull();

    // Verify resolved key, BPM, and energy
    expect(screen.getByText('5A')).toBeDefined();
    expect(screen.getByText('126.0 BPM')).toBeDefined();
    expect(screen.getByText('Energy 7/10')).toBeDefined();

    // Verify clicking inspect relationships triggers onSelectSong with fullSong
    const inspectBtn = screen.getByRole('button', { name: /Inspect Relationships/i });
    fireEvent.click(inspectBtn);
    expect(onSelectSong).toHaveBeenCalledTimes(1);
    expect(onSelectSong).toHaveBeenCalledWith(mockSongs[0]);
  });
});
