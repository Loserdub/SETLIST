import React from 'react';

export interface MeterProps {
  value: number;
  max?: number;
  segments?: number;
  colorRamp?: boolean;
  size?: 'sm' | 'md';
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  ariaLabel?: string;
}

const ENERGY_RAMP_VARS = [
  'var(--energy-1)',
  'var(--energy-2)',
  'var(--energy-3)',
  'var(--energy-4)',
  'var(--energy-5)',
  'var(--energy-6)',
  'var(--energy-7)',
  'var(--energy-8)',
  'var(--energy-9)',
  'var(--energy-10)',
];

export const Meter: React.FC<MeterProps> = ({
  value,
  max = 10,
  segments = 10,
  colorRamp = true,
  size = 'md',
  orientation = 'horizontal',
  className = '',
  ariaLabel = 'Energy meter',
}) => {
  const activeCount = Math.round((Math.max(0, Math.min(value, max)) / (max || 1)) * segments);

  const blockHeight = size === 'sm' ? 'h-2' : 'h-3';
  const blockWidth = size === 'sm' ? 'w-1' : 'w-1.5';

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-[2px] p-0.5 bg-[var(--surface-app)] border border-[var(--surface-hairline)] rounded-[1px] select-none ${
        orientation === 'vertical' ? 'flex-col-reverse' : 'flex-row'
      } ${className}`}
    >
      {Array.from({ length: segments }).map((_, index) => {
        const isActive = index < activeCount;
        const colorVar = colorRamp
          ? ENERGY_RAMP_VARS[Math.min(index, ENERGY_RAMP_VARS.length - 1)]
          : 'var(--accent)';

        return (
          <span
            key={index}
            data-testid={`meter-segment-${index}`}
            style={{
              backgroundColor: isActive ? colorVar : 'var(--surface-hairline)',
            }}
            className={`${blockWidth} ${blockHeight} rounded-[0.5px] shrink-0 led-instant`}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
};
