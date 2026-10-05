import React from 'react';

export interface ReadoutProps {
  caption: string;
  value: React.ReactNode;
  unit?: string;
  size?: 'sm' | 'md' | 'lg' | 'stage';
  variant?: 'default' | 'accent' | 'success';
  className?: string;
  dataTestId?: string;
}

export const Readout: React.FC<ReadoutProps> = ({
  caption,
  value,
  unit,
  size = 'md',
  variant = 'default',
  className = '',
  dataTestId,
}) => {
  const valueSizeClasses = {
    sm: 'text-sm font-semibold',
    md: 'text-base font-bold',
    lg: 'text-xl font-bold tracking-tight',
    stage: 'text-3xl font-extrabold tracking-tight',
  }[size];

  const variantColor = {
    default: 'text-[var(--text-primary)]',
    accent: 'text-[var(--accent)]',
    success: 'text-[var(--status-success)]',
  }[variant];

  return (
    <div
      data-testid={dataTestId}
      className={`inline-flex flex-col justify-between bg-[var(--surface-app)] border border-[var(--surface-hairline)] rounded-[2px] px-2.5 py-1 select-none font-mono min-w-[64px] ${className}`}
    >
      <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] leading-tight truncate">
        {caption}
      </span>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className={`font-mono tabular-nums leading-none ${valueSizeClasses} ${variantColor}`}>
          {value}
        </span>
        {unit && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
};
