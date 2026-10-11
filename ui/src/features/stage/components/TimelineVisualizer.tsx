import React, { useEffect, useRef } from 'react';
import { useStageControlsStore } from '../store/useStageControlsStore';

interface TimelineVisualizerProps {
  durationMs: number | null;
  positionMs: number; // Playhead position
}

export function TimelineVisualizer({ durationMs, positionMs }: TimelineVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { hotCues } = useStageControlsStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use ResizeObserver for responsive canvas
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        draw();
      }
    };

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;

      // 1. Clear background
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);

      const effectiveDuration = durationMs || 180000; // default 3 mins if unknown
      const progress = Math.min(Math.max(positionMs / effectiveDuration, 0), 1);
      const playheadX = progress * width;

      // 2. Draw mock waveform / center line
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Simulated waveform bars
      const numBars = Math.floor(width / 6);
      for (let i = 0; i < numBars; i++) {
        const x = i * 6;
        const normalizedX = x / width;
        // Generate pseudo-random height based on position
        const barHeight = 10 + Math.abs(Math.sin(normalizedX * 50) * Math.cos(normalizedX * 100)) * (height * 0.4);
        
        ctx.fillStyle = x <= playheadX ? '#38bdf8' : '#262626';
        ctx.fillRect(x, (height - barHeight) / 2, 3, barHeight);
      }

      // 3. Draw Hot Cues
      hotCues.forEach(cue => {
        const cueProgress = Math.min(Math.max(cue.positionMs / effectiveDuration, 0), 1);
        const cueX = cueProgress * width;
        
        // Convert tailwind color class to hex for canvas (approximate)
        let colorHex = '#fff';
        if (cue.color.includes('emerald')) colorHex = '#10b981';
        if (cue.color.includes('cyan')) colorHex = '#06b6d4';
        if (cue.color.includes('amber')) colorHex = '#f59e0b';
        if (cue.color.includes('purple')) colorHex = '#a855f7';

        // Draw marker line
        ctx.fillStyle = colorHex;
        ctx.fillRect(cueX, 0, 2, height);
        
        // Draw label
        ctx.fillStyle = colorHex;
        ctx.font = '10px monospace';
        ctx.fillText(cue.id, cueX + 4, 12);
      });

      // 4. Draw Playhead
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(playheadX, 0, 2, height);
      
      // Playhead glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'white';
      ctx.fillRect(playheadX - 1, height / 2 - 10, 4, 20);
      ctx.shadowBlur = 0;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // initial draw

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [durationMs, positionMs, hotCues]);

  return (
    <div className="w-full h-full relative" data-testid="timeline-visualizer">
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-sm"
        style={{ imageRendering: 'pixelated' }}
      />
      {/* Overlay text */}
      <div className="absolute bottom-2 right-3 text-[10px] font-mono text-[#666] tracking-widest uppercase">
        Live Waveform
      </div>
    </div>
  );
}
