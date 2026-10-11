import React from 'react';
import { useStageControlsStore } from '../store/useStageControlsStore';

interface PerformanceControlsProps {
  currentBpm?: number;
}

export function PerformanceControls({ currentBpm = 120 }: PerformanceControlsProps) {
  const {
    isPlaying,
    isSlipMode,
    hotCues,
    togglePlay,
    toggleSlipMode,
    triggerHotCue,
    setHotCue,
    beatJump,
  } = useStageControlsStore();

  // A preset list of cue pads to render
  const PAD_CONFIG = [
    { id: 'A', name: 'Cue A', color: 'bg-emerald-500' },
    { id: 'B', name: 'Cue B', color: 'bg-cyan-500' },
    { id: 'C', name: 'Cue C', color: 'bg-amber-500' },
    { id: 'D', name: 'Cue D', color: 'bg-purple-500' },
  ];

  return (
    <div
      className="flex flex-col gap-4 w-full max-w-sm h-full"
      data-testid="stage-performance-controls"
    >
      {/* 1. Slip Mode & Transport */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={toggleSlipMode}
          className={`flex-1 py-4 border text-xs font-mono font-bold uppercase tracking-widest transition-all rounded-sm ${
            isSlipMode
              ? 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
              : 'bg-[#0f0f0f] border-[#222] text-[#666] hover:text-[#999] hover:bg-[#141414]'
          }`}
        >
          Slip Mode {isSlipMode ? 'ON' : 'OFF'}
        </button>

        <button
          type="button"
          onClick={togglePlay}
          className={`flex-[2] py-4 border text-sm font-mono font-bold uppercase tracking-widest transition-all rounded-sm ${
            isPlaying
              ? 'bg-emerald-950 border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
              : 'bg-[#111] border-[#333] text-[#cfcfcf] hover:bg-[#1a1a1a] hover:border-[#444]'
          }`}
        >
          {isPlaying ? '⏸ PAUSE' : '▶ PLAY'}
        </button>
      </div>

      {/* 2. Beat Jump */}
      <div className="bg-[#0c0c0c] border border-[#1f1f1f] p-3 rounded-sm flex flex-col gap-2">
        <div className="text-[10px] font-mono text-[#a8a8a8] uppercase tracking-widest text-center">
          Beat Jump
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[-8, -4, 4, 8].map((beats) => (
            <button
              key={beats}
              type="button"
              onClick={() => beatJump(beats, currentBpm)}
              className="py-3 bg-[#141414] border border-[#262626] text-[#cfcfcf] text-xs font-mono font-semibold hover:bg-[#1f1f1f] hover:border-[#38bdf8] transition-all rounded-sm active:bg-[#38bdf8] active:text-black"
            >
              {beats > 0 ? `+${beats}` : beats}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Hot Cues (Performance Pads) */}
      <div className="bg-[#0c0c0c] border border-[#1f1f1f] p-3 rounded-sm flex flex-col gap-2 flex-1 min-h-0">
        <div className="text-[10px] font-mono text-[#a8a8a8] uppercase tracking-widest text-center">
          Hot Cues
        </div>
        <div className="grid grid-cols-2 grid-rows-2 gap-2 h-full">
          {PAD_CONFIG.map((pad) => {
            const cue = hotCues.find((c) => c.id === pad.id);
            const isSet = !!cue;
            return (
              <button
                key={pad.id}
                type="button"
                onClick={() => {
                  if (isSet) {
                    triggerHotCue(pad.id);
                  } else {
                    // Conceptually, would read current playhead. Setting to 0 for stub.
                    setHotCue(pad.id, 0, pad.name, pad.color);
                  }
                }}
                className={`relative flex flex-col items-center justify-center border transition-all rounded-sm active:scale-[0.98] ${
                  isSet
                    ? `bg-[#141414] border-t-4 border-b-[#262626] border-x-[#262626] hover:bg-[#1a1a1a] shadow-inner`
                    : 'bg-[#0f0f0f] border-[#1c1c1c] hover:bg-[#141414]'
                }`}
                style={{ borderTopColor: isSet ? 'var(--pad-color)' : 'transparent' } as React.CSSProperties}
              >
                {/* Custom property trick for tailwind dynamic borders could be done via inline styles */}
                <span className={`text-xl font-bold font-mono ${isSet ? 'text-white' : 'text-[#333]'}`}>
                  {pad.id}
                </span>
                {isSet && (
                  <div
                    className={`absolute top-0 left-0 w-full h-1 ${pad.color} opacity-80`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
