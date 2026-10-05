import React from 'react';

export interface FaderProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  dataTestId?: string;
}

export const Fader: React.FC<FaderProps> = ({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  label,
  unit,
  disabled = false,
  className = '',
  ariaLabel,
  dataTestId,
}) => {
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));

  return (
    <div className={`inline-flex flex-col gap-1 select-none font-mono ${className}`}>
      {(label || unit) && (
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)] silkscreen">
          {label && <span>{label}</span>}
          <span className="tabular-nums text-[var(--text-secondary)]">
            {value.toFixed(step < 0.1 ? 2 : 1)}
            {unit}
          </span>
        </div>
      )}
      <div className="relative flex items-center h-4 group">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label={ariaLabel || label}
          data-testid={dataTestId}
          className="w-full h-1 bg-[var(--surface-hairline)] appearance-none cursor-pointer rounded-none disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-1 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-[var(--surface-raised)] [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[var(--surface-strong)] [&::-webkit-slider-thumb]:rounded-[1px] [&::-webkit-slider-thumb]:hover:border-[var(--accent)] [&::-webkit-slider-thumb]:active:bg-[var(--accent)] [&::-webkit-slider-thumb]:active:border-[var(--accent)] [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:bg-[var(--surface-raised)] [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[var(--surface-strong)] [&::-moz-range-thumb]:rounded-[1px] [&::-moz-range-thumb]:hover:border-[var(--accent)]"
        />
        {/* Fill indicator track */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-[var(--accent)]/50 pointer-events-none rounded-none"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
