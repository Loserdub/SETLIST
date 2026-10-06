import React from 'react';
import type { Segment } from '../../bindings/Segment';

export const SEGMENT_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  intro: { bg: '#475569', border: '#71717a', label: 'Intro' },
  verse: { bg: '#4f46e5', border: '#818cf8', label: 'Verse' },
  buildup: { bg: '#ea580c', border: '#fb923c', label: 'Buildup' },
  drop: { bg: '#dc2626', border: '#f87171', label: 'Drop' },
  breakdown: { bg: '#7c3aed', border: '#a78bfa', label: 'Breakdown' },
  outro: { bg: '#059669', border: '#34d399', label: 'Outro' },
};

function formatTime(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

interface StructuralMiniMapProps {
  segments?: Segment[] | null;
  durationMs: number;
  className?: string;
  width?: number | string;
  height?: number | string;
}

export const StructuralMiniMap: React.FC<StructuralMiniMapProps> = ({
  segments,
  durationMs,
  className = '',
  width,
  height,
}) => {
  const customStyle: React.CSSProperties = {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };

  if (!segments || segments.length === 0 || durationMs <= 0) {
    return (
      <div
        style={customStyle}
        className={`h-2.5 w-24 bg-[#141414] border border-[#222222] rounded-none flex items-center justify-center ${className}`}
        title="No structural segments analyzed"
      >
        <span className="text-[11px] font-mono uppercase tracking-widest text-content-dim leading-none">NO MAP</span>
      </div>
    );
  }

  // Build summary tooltip
  const tooltipText = segments
    .map(
      (s) =>
        `${SEGMENT_COLORS[s.label]?.label ?? s.label} (${formatTime(s.start_ms)} - ${formatTime(s.end_ms)})`
    )
    .join(' · ');

  return (
    <div
      style={customStyle}
      className={`h-2.5 w-24 bg-[#101010] border border-[#262626] rounded-none flex overflow-hidden ${className}`}
      title={`Structure: ${tooltipText}`}
      data-testid="structural-mini-map"
    >
      {segments.map((seg, idx) => {
        const segDuration = Math.max(0, seg.end_ms - seg.start_ms);
        const widthPercent = Math.min(100, Math.max(2, (segDuration / durationMs) * 100));
        const colorConfig = SEGMENT_COLORS[seg.label] ?? {
          bg: '#52525b',
          border: '#71717a',
          label: seg.label,
        };

        return (
          <div
            key={`${seg.label}-${idx}`}
            style={{
              width: `${widthPercent}%`,
              backgroundColor: colorConfig.bg,
            }}
            className="h-full border-r border-[#0a0a0a]/50 last:border-r-0 transition-opacity hover:opacity-80"
          />
        );
      })}
    </div>
  );
};
