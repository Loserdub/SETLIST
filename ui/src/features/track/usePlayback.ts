import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getPlaybackClient,
  type PlayerState,
  type PlaybackPositionPayload,
} from '../../api/playback';
import { interpolatePosition } from './playbackMath';
import { useTrackState } from './useTrackState';

export interface UsePlaybackOptions {
  trackId?: string;
  durationMs: number;
}

export interface UsePlaybackReturn {
  state: PlayerState;
  positionMs: number;
  durationMs: number;
  clickEnabled: boolean;
  isLoading: boolean;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seek: (targetMs: number) => Promise<void>;
  setClick: (enabled: boolean) => Promise<void>;
  toggleClick: () => Promise<void>;
  stop: () => Promise<void>;
}

export function usePlayback({ trackId, durationMs }: UsePlaybackOptions): UsePlaybackReturn {
  const [playerState, setPlayerState] = useState<PlayerState>('stopped');
  const [positionMs, setPositionMs] = useState(0);
  const [clickEnabled, setClickEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const setPlayheadPositionMs = useTrackState((s) => s.setPlayheadPositionMs);

  const client = getPlaybackClient();
  const lastEventPositionRef = useRef(0);
  const lastEventTimestampRef = useRef(0);
  const stateRef = useRef<PlayerState>('stopped');
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;

  const rafIdRef = useRef<number | null>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // 60 FPS requestAnimationFrame Interpolation Loop
  // ───────────────────────────────────────────────────────────────────────────
  const startRafLoop = useCallback(() => {
    if (rafIdRef.current !== null) return;

    const tick = () => {
      if (stateRef.current === 'playing') {
        const now = performance.now();
        const currentPos = interpolatePosition(
          lastEventPositionRef.current,
          lastEventTimestampRef.current,
          now,
          'playing',
          durationRef.current
        );

        setPositionMs(currentPos);
        setPlayheadPositionMs(currentPos);

        rafIdRef.current = requestAnimationFrame(tick);
      } else {
        rafIdRef.current = null;
      }
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, [setPlayheadPositionMs]);

  const stopRafLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Position Event Listener
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = client.onPosition((payload: PlaybackPositionPayload) => {
      lastEventPositionRef.current = payload.position_ms;
      lastEventTimestampRef.current = performance.now();
      stateRef.current = payload.state;
      setPlayerState(payload.state);

      if (payload.state === 'playing') {
        startRafLoop();
      } else {
        stopRafLoop();
        setPositionMs(payload.position_ms);
        setPlayheadPositionMs(payload.position_ms);
      }
    });

    return () => {
      unsubscribe();
      stopRafLoop();
    };
  }, [client, startRafLoop, stopRafLoop, setPlayheadPositionMs]);

  // ───────────────────────────────────────────────────────────────────────────
  // Load Track and Route / Track Lifecycle Cleanup
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!trackId) return;

    let isMounted = true;
    setIsLoading(true);

    client
      .load(trackId)
      .catch((err) => {
        console.error('Failed to load track into audio engine:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    // Stop playback whenever track route changes or another track is opened
    return () => {
      isMounted = false;
      stopRafLoop();
      client.stop().catch((err) => {
        console.error('Failed to stop playback on track switch:', err);
      });
    };
  }, [trackId, client, stopRafLoop]);

  // ───────────────────────────────────────────────────────────────────────────
  // Actions
  // ───────────────────────────────────────────────────────────────────────────
  const play = useCallback(async () => {
    try {
      await client.play();
    } catch (err) {
      console.error('Playback play failed:', err);
    }
  }, [client]);

  const pause = useCallback(async () => {
    try {
      await client.pause();
    } catch (err) {
      console.error('Playback pause failed:', err);
    }
  }, [client]);

  const togglePlayPause = useCallback(async () => {
    if (stateRef.current === 'playing') {
      await pause();
    } else {
      await play();
    }
  }, [play, pause]);

  const seek = useCallback(
    async (targetMs: number) => {
      const clamped = Math.max(0, Math.min(durationRef.current, targetMs));
      lastEventPositionRef.current = clamped;
      lastEventTimestampRef.current = performance.now();
      setPositionMs(clamped);
      setPlayheadPositionMs(clamped);

      try {
        await client.seek(clamped);
      } catch (err) {
        console.error('Playback seek failed:', err);
      }
    },
    [client, setPlayheadPositionMs]
  );

  const setClick = useCallback(
    async (enabled: boolean) => {
      setClickEnabled(enabled);
      try {
        await client.setClick(enabled);
      } catch (err) {
        console.error('Playback set click failed:', err);
      }
    },
    [client]
  );

  const toggleClick = useCallback(async () => {
    await setClick(!clickEnabled);
  }, [clickEnabled, setClick]);

  const stop = useCallback(async () => {
    stopRafLoop();
    try {
      await client.stop();
    } catch (err) {
      console.error('Playback stop failed:', err);
    }
  }, [client, stopRafLoop]);

  return {
    state: playerState,
    positionMs,
    durationMs,
    clickEnabled,
    isLoading,
    play,
    pause,
    togglePlayPause,
    seek,
    setClick,
    toggleClick,
    stop,
  };
}
