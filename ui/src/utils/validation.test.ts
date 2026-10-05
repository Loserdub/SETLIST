import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateDurationSeconds,
  validateBpm,
  validateEnergyRating,
  validateCapo,
  validateKeyNotation,
  validateMode,
  validateTuning,
  validateSong,
  validateSetlist,
} from './validation';
import type { Song } from '../bindings/Song';
import type { Setlist } from '../bindings/Setlist';
import type { SetlistItem } from '../bindings/SetlistItem';
import { entryToSetlistItem, setlistItemToEntry, trackToSong, mockBackend } from '../api';
import type { Track } from '../bindings/Track';
import { useAppStore } from '../store/useAppStore';

describe('Domain Validation Suite (TASK 2)', () => {
  describe('validateDurationSeconds', () => {
    it('accepts valid positive and zero duration', () => {
      expect(validateDurationSeconds(0)).toBeNull();
      expect(validateDurationSeconds(180.5)).toBeNull();
    });

    it('rejects negative, NaN, and infinite duration', () => {
      expect(validateDurationSeconds(-0.1)).toEqual({
        field: 'duration_seconds',
        message: 'duration cannot be negative',
        invalid_value: '-0.10',
      });
      expect(validateDurationSeconds(NaN)?.message).toContain('finite');
      expect(validateDurationSeconds(Infinity)?.message).toContain('finite');
    });
  });

  describe('validateBpm', () => {
    it('accepts reasonable musical tempo [20, 300]', () => {
      expect(validateBpm(20.0)).toBeNull();
      expect(validateBpm(128.0)).toBeNull();
      expect(validateBpm(300.0)).toBeNull();
    });

    it('rejects out of range, negative, and infinite tempo', () => {
      expect(validateBpm(19.9)?.message).toContain('sensible musical range');
      expect(validateBpm(300.1)?.message).toContain('sensible musical range');
      expect(validateBpm(-120)?.message).toContain('sensible musical range');
      expect(validateBpm(NaN)?.message).toContain('finite');
    });
  });

  describe('validateEnergyRating', () => {
    it('accepts integers 1 to 10', () => {
      for (let i = 1; i <= 10; i++) {
        expect(validateEnergyRating(i)).toBeNull();
      }
    });

    it('rejects 0, 11, floats, and negatives', () => {
      expect(validateEnergyRating(0)).not.toBeNull();
      expect(validateEnergyRating(11)).not.toBeNull();
      expect(validateEnergyRating(5.5)).not.toBeNull();
      expect(validateEnergyRating(-1)).not.toBeNull();
    });
  });

  describe('validateCapo', () => {
    it('accepts capo 0 to 24', () => {
      expect(validateCapo(0)).toBeNull();
      expect(validateCapo(7)).toBeNull();
      expect(validateCapo(24)).toBeNull();
    });

    it('rejects negative, float, and beyond 24', () => {
      expect(validateCapo(-1)).not.toBeNull();
      expect(validateCapo(25)).not.toBeNull();
      expect(validateCapo(2.5)).not.toBeNull();
    });
  });

  describe('validateKeyNotation', () => {
    it('accepts valid Camelot keys', () => {
      expect(validateKeyNotation('1A')).toBeNull();
      expect(validateKeyNotation('12B')).toBeNull();
      expect(validateKeyNotation('8a')).toBeNull();
    });

    it('accepts standard pitch notation keys', () => {
      expect(validateKeyNotation('C')).toBeNull();
      expect(validateKeyNotation('Am')).toBeNull();
      expect(validateKeyNotation('F#m')).toBeNull();
      expect(validateKeyNotation('Eb')).toBeNull();
      expect(validateKeyNotation('G#min')).toBeNull();
      expect(validateKeyNotation('Bbmaj')).toBeNull();
    });

    it('rejects empty and malformed keys', () => {
      expect(validateKeyNotation('')).not.toBeNull();
      expect(validateKeyNotation('   ')).not.toBeNull();
      expect(validateKeyNotation('13A')).not.toBeNull();
      expect(validateKeyNotation('0B')).not.toBeNull();
      expect(validateKeyNotation('H minor')).not.toBeNull();
      expect(validateKeyNotation('XYZ')).not.toBeNull();
    });
  });

  describe('validateMode', () => {
    it('accepts Major and Minor', () => {
      expect(validateMode('Major')).toBeNull();
      expect(validateMode('Minor')).toBeNull();
    });

    it('rejects invalid modes', () => {
      expect(validateMode('Dorian')).not.toBeNull();
      expect(validateMode('major')).not.toBeNull();
      expect(validateMode('')).not.toBeNull();
    });
  });

  describe('validateTuning', () => {
    it('accepts valid tuning strings', () => {
      expect(validateTuning('Standard')).toBeNull();
      expect(validateTuning('Drop D')).toBeNull();
      expect(validateTuning('DADGAD')).toBeNull();
      expect(validateTuning('Open G (DGDGBD)')).toBeNull();
    });

    it('rejects empty, overlong, and non-printable tunings', () => {
      expect(validateTuning('')).not.toBeNull();
      expect(validateTuning(' '.repeat(5))).not.toBeNull();
      expect(validateTuning('A'.repeat(51))).not.toBeNull();
      expect(validateTuning('Drop D\x00')).not.toBeNull();
    });
  });

  describe('validateSong', () => {
    const validSong: Song = {
      id: 'song-001',
      title: 'Strobe',
      artist: 'Deadmau5',
      duration_seconds: 637.0,
      bpm: 128.0,
      musical_key: '8A',
      mode: 'Minor',
      camelot_code: '8A',
      tuning: 'Standard',
      capo: 0,
      energy_rating: 8,
      lead_performer: 'Deadmau5',
      tags: ['Progressive House'],
      notes: 'Peak track',
    };

    it('passes completely valid song', () => {
      expect(validateSong(validSong)).toHaveLength(0);
    });

    it('collects multiple validation errors on malformed song', () => {
      const badSong: Song = {
        ...validSong,
        title: '',
        artist: '',
        duration_seconds: -10,
        bpm: 450,
        energy_rating: 15,
        capo: -3,
        musical_key: 'INVALID',
        tuning: '',
      };
      const errors = validateSong(badSong);
      expect(errors.length).toBeGreaterThanOrEqual(6);
      const fields = errors.map((e) => e.field);
      expect(fields).toContain('title');
      expect(fields).toContain('artist');
      expect(fields).toContain('duration_seconds');
      expect(fields).toContain('bpm');
      expect(fields).toContain('energy_rating');
      expect(fields).toContain('capo');
      expect(fields).toContain('musical_key');
      expect(fields).toContain('tuning');
    });
  });

  describe('validateSetlist', () => {
    const validSetlist: Setlist = {
      id: 'set-001',
      name: 'Friday Night Headline',
      energy_profile: 'PeakPlateau',
      items: [
        {
          id: 'item-1',
          position: 1,
          item: { type: 'Song', data: { song_id: 'song-1', song: null } },
          transition: null,
          target_energy: 7.0,
          notes: null,
        },
        {
          id: 'item-2',
          position: 2,
          item: { type: 'Banter', data: { topic: 'Welcome crowd', duration_seconds: 30 } },
          transition: null,
          target_energy: 7.5,
          notes: null,
        },
        {
          id: 'item-3',
          position: 3,
          item: { type: 'Song', data: { song_id: 'song-2', song: null } },
          transition: null,
          target_energy: 8.0,
          notes: null,
        },
      ],
      created_at: null,
      updated_at: null,
    };

    it('passes valid setlist with consecutive positions and diverse items', () => {
      expect(validateSetlist(validSetlist)).toHaveLength(0);
    });

    it('catches non-consecutive or duplicate positions', () => {
      const gapSetlist: Setlist = {
        ...validSetlist,
        items: [
          validSetlist.items[0],
          { ...validSetlist.items[1], position: 4 }, // gap from 1 to 4
        ],
      };
      const errors = validateSetlist(gapSetlist);
      expect(errors.some((e) => e.field === 'items.position')).toBe(true);
    });

    it('catches empty setlist name', () => {
      const unnamedSetlist: Setlist = {
        ...validSetlist,
        name: '   ',
      };
      const errors = validateSetlist(unnamedSetlist);
      expect(errors.some((e) => e.field === 'name')).toBe(true);
    });
  });
});

describe('Model Conversion & Performance Blocks (TASK 1)', () => {
  const sampleTrack: Track = {
    id: 'track-abc',
    path: 'C:/Music/test.mp3',
    hash: 'hash-abc',
    tags: {
      title: 'Aerodynamic',
      artist: 'Daft Punk',
      album: 'Discovery',
    },
    duration_ms: 212000,
    analysis: {
      loudness: { integrated_lufs: -12.0, loudness_range: 6.0, true_peak: -0.5 },
      rhythm: {
        grid: {
          first_downbeat_ms: 100,
          bpm: 123.0,
          beats_ms: [100, 587],
          downbeat_flags: [true, false],
          steady: true,
        },
        bpm_alternates: [],
      },
      key: {
        pitch_class: 9,
        mode: 'Minor',
        camelot: { number: 4, letter: 'A' },
        tuning_cents: 0,
      },
      dynamics: { frame_rate: 86.13, rms_curve: [], low_ratio_curve: [], centroid_curve: [] },
      energy_score: 8,
      energy_curve: { per_bar: [] },
      segments: [],
      cue_points: [],
      waveform: { points_per_sec: 10, low: { peak: [], rms: [] }, mid: { peak: [], rms: [] }, high: { peak: [], rms: [] } },
    },
    analyzed_at: null,
    analysis_version: 'v1.0.0',
  };

  it('converts Track to strongly typed Song', () => {
    const song = trackToSong(sampleTrack);
    expect(song.id).toBe('track-abc');
    expect(song.title).toBe('Aerodynamic');
    expect(song.artist).toBe('Daft Punk');
    expect(song.duration_seconds).toBe(212);
    expect(song.bpm).toBe(123.0);
    expect(song.mode).toBe('Minor');
    expect(song.camelot_code).toBe('4A');
    expect(song.energy_rating).toBe(8);
  });

  it('converts UI SetlistEntry to SetlistItem and back preserving non-song blocks', () => {
    const sampleEntry = {
      position: 1,
      track_id: sampleTrack.id,
      track: sampleTrack,
      transition: null,
      target_energy: 7.0,
    };
    const setlistItem = entryToSetlistItem(sampleEntry);
    expect(setlistItem.position).toBe(1);
    expect(setlistItem.item.type).toBe('Song');
    if (setlistItem.item.type === 'Song') {
      expect(setlistItem.item.data.song_id).toBe(sampleTrack.id);
      expect(setlistItem.item.data.song?.title).toBe('Aerodynamic');
    }

    const banterItem: SetlistItem = {
      id: 'banter-1',
      position: 2,
      item: { type: 'Banter', data: { topic: 'Shout out to the DJ booth', duration_seconds: 45 } },
      transition: null,
      target_energy: null,
      notes: null,
    };

    const tracksMap = new Map<string, Track>();
    const entry = setlistItemToEntry(banterItem, tracksMap);
    expect(entry.position).toBe(2);
    expect(entry.track?.tags.artist).toBe('Banter');
    expect(entry.track?.tags.title).toContain('Shout out');

    const intermissionItem: SetlistItem = {
      id: 'intermission-1',
      position: 5,
      item: { type: 'Intermission', data: { duration_seconds: 900, notes: 'Drink break' } },
      transition: null,
      target_energy: null,
      notes: null,
    };
    const intermissionEntry = setlistItemToEntry(intermissionItem, tracksMap);
    expect(intermissionEntry.track?.tags.title).toBe('Intermission (15m)');
  });
});

describe('Store Synchronization and Persistence (TASK 4 & 5)', () => {
  beforeEach(() => {
    useAppStore.setState({
      setlist: [],
      setlistVersion: 0,
      activeSetlistId: null,
      hasLoadedActiveSetlist: false,
    });
  });

  it('hydrates active setlist on startup via loadActiveSetlist', async () => {
    const sampleSetlist: Setlist = {
      id: 'active-saved-1',
      name: 'Festival Main Stage',
      energy_profile: 'LinearRamp',
      items: [
        {
          id: 'item-1',
          position: 1,
          item: { type: 'Song', data: { song_id: 'track-001', song: null } },
          transition: null,
          target_energy: 5.0,
          notes: null,
        },
      ],
      created_at: null,
      updated_at: null,
    };

    const mockDbBackend = {
      ...mockBackend,
      getActiveSetlist: vi.fn().mockResolvedValue(sampleSetlist),
      saveActiveSetlist: vi.fn().mockResolvedValue(undefined),
    };

    await useAppStore.getState().loadActiveSetlist(mockDbBackend as unknown as import('../api').Backend);

    const state = useAppStore.getState();
    expect(state.hasLoadedActiveSetlist).toBe(true);
    expect(state.activeSetlistId).toBe('active-saved-1');
    expect(state.setlistName).toBe('Festival Main Stage');
    expect(state.energyProfile).toBe('LinearRamp');
    expect(state.setlist).toHaveLength(1);
    expect(state.setlist[0].track_id).toBe('track-001');
  });

  it('debounces rapid setlist mutations to prevent excessive persistence calls', async () => {
    vi.useFakeTimers();
    const saveActiveSetlistSpy = vi.fn().mockResolvedValue(undefined);
    const mockDbBackend = {
      ...mockBackend,
      saveActiveSetlist: saveActiveSetlistSpy,
    };

    // Simulate 5 rapid reorder mutations
    const { scheduleActiveSetlistPersistence } = await import('../store/useAppStore');
    for (let i = 0; i < 5; i++) {
      useAppStore.setState({ setlistName: `Setlist Name Change ${i}` });
      scheduleActiveSetlistPersistence(useAppStore.getState, mockDbBackend as unknown as import('../api').Backend);
    }

    // Immediately after changes, no persistence calls should have fired
    expect(saveActiveSetlistSpy).not.toHaveBeenCalled();

    // Advance 200ms (still within 300ms debounce threshold)
    vi.advanceTimersByTime(200);
    expect(saveActiveSetlistSpy).not.toHaveBeenCalled();

    // Advance remaining 100ms
    vi.advanceTimersByTime(100);
    expect(saveActiveSetlistSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('re-links track details in active setlist when loadTracks completes after setlist load', async () => {
    // Simulate setlist loaded before tracks finished loading
    useAppStore.setState({
      setlist: [
        {
          position: 1,
          track_id: 'track-001',
          track: null,
          transition: null,
          target_energy: 5.0,
        },
      ],
      tracks: [],
      hasLoadedTracks: false,
    });

    await useAppStore.getState().loadTracks(mockBackend as unknown as import('../api').Backend);

    const updated = useAppStore.getState().setlist;
    expect(updated[0].track).not.toBeNull();
    expect(updated[0].track?.id).toBe('track-001');
    expect(updated[0].track?.tags.title).toBeDefined();
  });

  it('refreshTrackInSetlist updates track in setlist and recomputes transition advice for adjacent tracks', async () => {
    const tracks = await mockBackend.listTracks();
    const t1 = JSON.parse(JSON.stringify(tracks[0]));
    const t2 = JSON.parse(JSON.stringify(tracks[1]));
    const t3 = JSON.parse(JSON.stringify(tracks[2]));

    const dummyAdvice1: import('../bindings/TransitionAdvice').TransitionAdvice = {
      transition_type: 'ExactMatch',
      bpm_delta: 0,
      key_distance: 0,
      mode_flip: false,
      intervention_required: false,
      loop_extension_recommended: false,
      phrase_bars: 16,
      notes: ['initial advice 1'],
      total_cost: 0.1,
      tempo_cost: 0.0,
      key_cost: 0.0,
      energy_cost: 0.1,
      timbre_cost: null,
      de_target: null,
      weights: null,
      profile: null,
    };

    const dummyAdvice2: import('../bindings/TransitionAdvice').TransitionAdvice = {
      ...dummyAdvice1,
      notes: ['initial advice 2'],
    };

    useAppStore.setState({
      tracks: [t1, t2, t3],
      selectedTrackId: t2.id,
      selectedTrack: t2,
      setlist: [
        { position: 1, track_id: t1.id, track: t1, transition: null, target_energy: 5.0 },
        { position: 2, track_id: t2.id, track: t2, transition: dummyAdvice1, target_energy: 6.0 },
        { position: 3, track_id: t3.id, track: t3, transition: dummyAdvice2, target_energy: 7.0 },
      ],
      setlistVersion: 1,
    });

    const mockGetAdvice = vi.fn(async (fromId: string, toId: string) => ({
      ...dummyAdvice1,
      notes: [`recomputed ${fromId}->${toId}`],
    }));

    const customBackend = {
      ...mockBackend,
      getAdvice: mockGetAdvice,
      saveActiveSetlist: vi.fn(async () => {}),
    } as unknown as import('../api').Backend;

    const freshT2 = JSON.parse(JSON.stringify(t2));
    freshT2.analysis.rhythm.grid.bpm = 135.0;

    await useAppStore.getState().refreshTrackInSetlist(freshT2, customBackend);

    const state = useAppStore.getState();
    expect(state.selectedTrack?.analysis?.rhythm.grid.bpm).toBe(135.0);
    expect(state.tracks.find((t) => t.id === t2.id)?.analysis?.rhythm.grid.bpm).toBe(135.0);
    expect(state.setlist[1].track?.analysis?.rhythm.grid.bpm).toBe(135.0);

    // Verify both adjacent transitions were recomputed
    expect(mockGetAdvice).toHaveBeenCalledWith(
      t1.id,
      t2.id,
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(mockGetAdvice).toHaveBeenCalledWith(
      t2.id,
      t3.id,
      expect.anything(),
      expect.anything(),
      expect.anything()
    );

    expect(state.setlist[1].transition?.notes[0]).toBe(`recomputed ${t1.id}->${t2.id}`);
    expect(state.setlist[2].transition?.notes[0]).toBe(`recomputed ${t2.id}->${t3.id}`);
  });
});

