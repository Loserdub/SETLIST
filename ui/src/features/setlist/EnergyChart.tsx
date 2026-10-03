import { useMemo } from 'react';
import type { EnergyPoint } from './types';
import type { EnergyProfile } from '../../bindings/EnergyProfile';

interface EnergyChartProps {
  points: EnergyPoint[];
  profile: EnergyProfile;
}

export function EnergyChart({ points, profile }: EnergyChartProps) {
  const width = 680;
  const height = 130;
  const paddingX = 35;
  const paddingY = 20;

  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  const n = points.length;

  const { targetPath, actualPath, pointCoords } = useMemo(() => {
    if (n === 0) {
      return { targetPath: '', actualPath: '', pointCoords: [] };
    }

    const getX = (index: number) => {
      if (n === 1) return paddingX + chartWidth / 2;
      return paddingX + (index / (n - 1)) * chartWidth;
    };

    const getY = (val: number) => {
      // Scale 1 to 10
      const clamped = Math.min(Math.max(val, 1), 10);
      const frac = (clamped - 1) / 9;
      return height - paddingY - frac * chartHeight;
    };

    // Build target polyline
    const targetPoints = points.map((p, i) => `${getX(i)},${getY(p.targetEnergy)}`);
    const targetPath = `M ${targetPoints.join(' L ')}`;

    // Build actual polyline
    const actualPoints = points.map((p, i) => `${getX(i)},${getY(p.actualEnergy)}`);
    const actualPath = `M ${actualPoints.join(' L ')}`;

    const pointCoords = points.map((p, i) => ({
      x: getX(i),
      y: getY(p.actualEnergy),
      targetY: getY(p.targetEnergy),
      data: p,
    }));

    return { targetPath, actualPath, pointCoords };
  }, [points, n, chartWidth, chartHeight]);

  if (n === 0) {
    return (
      <div className="h-24 flex items-center justify-center bg-[#0a0a0a] border border-[#1a1a1a] text-xs text-[#555555] font-mono rounded-none">
        Add tracks to chart energy progression
      </div>
    );
  }

  const profileLabel =
    profile === 'LinearRamp'
      ? 'Linear Ramp (Rising)'
      : profile === 'Wave'
      ? 'Wave Arc (Peaks & Dips)'
      : 'Peak Plateau (Sustained)';

  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-3 space-y-1.5 select-none rounded-none">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#cccccc]">
            Energy Trajectory
          </span>
          <span className="text-[10px] text-[#666666] font-mono">
            Target: <span className="text-[#a0a0a0]">{profileLabel}</span>
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono">
          <span className="flex items-center gap-1.5 text-[#666666]">
            <span className="w-3 h-0.5 bg-[#666666] inline-block border-t border-dashed" />
            <span>Target Arc</span>
          </span>
          <span className="flex items-center gap-1.5 text-[#d0d0d0]">
            <span className="w-2 h-0.5 bg-[#d0d0d0] inline-block" />
            <span>Actual Setlist</span>
          </span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-28 overflow-visible"
        >
          {/* Background grid lines for Y values (1, 3, 5, 7, 10) */}
          {[1, 3, 5, 7, 10].map((level) => {
            const y = height - paddingY - ((level - 1) / 9) * chartHeight;
            return (
              <g key={level}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="#161616"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <text
                  x={paddingX - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="8"
                  fill="#444444"
                  fontFamily="monospace"
                >
                  {level}
                </text>
              </g>
            );
          })}

          {/* Target energy curve path (dashed gray) */}
          <path
            d={targetPath}
            fill="none"
            stroke="#555555"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />

          {/* Actual track energy curve path (solid crisp white/light gray) */}
          <path
            d={actualPath}
            fill="none"
            stroke="#d4d4d4"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points & Interactive Tooltips */}
          {pointCoords.map((pt) => (
            <g key={pt.data.position} className="group cursor-pointer">
              {/* Vertical connector to target */}
              <line
                x1={pt.x}
                y1={pt.y}
                x2={pt.x}
                y2={pt.targetY}
                stroke="#2a2a2a"
                strokeWidth="1"
                strokeDasharray="2 2"
              />

              {/* Point dot */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r="3"
                fill="#ececec"
                stroke="#0a0a0a"
                strokeWidth="1"
              />

              {/* Position indicator on X axis */}
              <text
                x={pt.x}
                y={height - 5}
                textAnchor="middle"
                fontSize="8"
                fill="#555555"
                fontFamily="monospace"
              >
                #{pt.data.position}
              </text>

              {/* Hover popup tooltip */}
              <title>
                {`#${pt.data.position}: ${pt.data.trackTitle}\nEnergy: ${pt.data.actualEnergy} (Target: ${pt.data.targetEnergy})\nKey: ${pt.data.camelotKey} | BPM: ${pt.data.bpm}`}
              </title>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export default EnergyChart;
