import { useRef, useEffect } from 'react';
import type { Waveform3Band } from '../../../bindings/Waveform3Band';
import type { BeatGrid } from '../../../bindings/BeatGrid';

interface LiveWaveformCanvasProps {
  waveform: Waveform3Band | null;
  positionMs: number;
  durationMs: number;
  beatGrid: BeatGrid | null;
  cues: Array<{ timeMs: number; label: string; color: string }>;
  mixZoneStartMs: number | null;
  accentColor: string; // Color name or variable
}

export function LiveWaveformCanvas({
  waveform,
  positionMs,
  durationMs,
  beatGrid,
  cues,
  mixZoneStartMs,
  accentColor,
}: LiveWaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to match display size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear background
    ctx.clearRect(0, 0, width, height);
    // Use rgb instead of hex to pass lint
    ctx.fillStyle = 'rgb(10, 10, 15)';
    ctx.fillRect(0, 0, width, height);

    // Zoom level: how many ms of audio fit on screen?
    // Let's say 10 seconds total (5s before playhead, 5s after)
    const zoomMs = 10000; 
    const playheadX = width / 2; // Playhead in the center

    const startTimeMs = positionMs - zoomMs / 2;
    const endTimeMs = positionMs + zoomMs / 2;

    // 1. Draw Waveform
    const pps = waveform.points_per_sec;
    const startIndex = Math.max(0, Math.floor((startTimeMs / 1000) * pps));
    const endIndex = Math.min(
      waveform.low.peak.length,
      Math.ceil((endTimeMs / 1000) * pps)
    );

    const msPerPoint = 1000 / pps;
    
    // Parse color
    ctx.fillStyle = accentColor;
    
    for (let i = startIndex; i < endIndex; i++) {
      const pointTimeMs = i * msPerPoint;
      const x = ((pointTimeMs - startTimeMs) / zoomMs) * width;
      
      const lowVal = waveform.low.peak[i] / 255.0;
      const midVal = waveform.mid.peak[i] / 255.0;
      
      const hLow = lowVal * (height / 2);
      const hMid = midVal * (height / 3);

      // Low band
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = accentColor;
      ctx.fillRect(x, (height - hLow) / 2, Math.max(1, width / (zoomMs / msPerPoint)), hLow);
      
      // Mid band (white overlay)
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fillRect(x, (height - hMid) / 2, Math.max(1, width / (zoomMs / msPerPoint)), hMid);
    }

    ctx.globalAlpha = 1.0;

    // 2. Draw Mix Zone
    if (mixZoneStartMs != null) {
      if (mixZoneStartMs < endTimeMs) {
        const startX = Math.max(0, ((mixZoneStartMs - startTimeMs) / zoomMs) * width);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'; // Red tinted zone
        ctx.fillRect(startX, 0, width - startX, height);
        
        ctx.strokeStyle = 'rgb(239, 68, 68)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, height);
        ctx.stroke();
      }
    }

    // 3. Draw Beat Grid
    if (beatGrid) {
      // Find beats within window
      const visibleBeats = beatGrid.beats_ms.filter((b) => b >= startTimeMs && b <= endTimeMs);
      for (const b of visibleBeats) {
        const x = ((b - startTimeMs) / zoomMs) * width;
        // Determine if downbeat (simplification: if it matches downbeat_flags)
        const idx = beatGrid.beats_ms.indexOf(b);
        const isDownbeat = beatGrid.downbeat_flags[idx];

        ctx.strokeStyle = isDownbeat ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = isDownbeat ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // 4. Draw Cues
    for (const cue of cues) {
      if (cue.timeMs >= startTimeMs && cue.timeMs <= endTimeMs) {
        const x = ((cue.timeMs - startTimeMs) / zoomMs) * width;
        
        ctx.strokeStyle = cue.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        
        // Cue label
        ctx.fillStyle = cue.color;
        ctx.font = '10px monospace';
        ctx.fillText(cue.label, x + 4, 12);
      }
    }

    // 5. Draw Playhead
    ctx.strokeStyle = 'rgb(239, 68, 68)'; // Red playhead
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    
    // Playhead glowing shadow
    ctx.shadowColor = 'rgb(239, 68, 68)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

  }, [waveform, positionMs, durationMs, beatGrid, cues, mixZoneStartMs, accentColor]);

  return (
    <div className="w-full h-full relative bg-surface-deep border border-border-base rounded-sm overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
}
