import React from 'react';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string | number> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  name?: string;
  ariaLabel?: string;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
  ariaLabel,
}: SegmentedProps<T>) {
  const sizeClasses = {
    sm: 'text-xs py-0.5 px-2',
    md: 'text-xs py-1 px-2.5',
  }[size];

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex items-center bg-[var(--surface-app)] border border-[var(--surface-hairline)] rounded-[2px] p-0.5 gap-0.5 select-none ${className}`}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={isSelected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1 font-mono uppercase tracking-wider rounded-[2px] hw-transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-1 ${sizeClasses} ${
              isSelected
                ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] font-semibold border border-[var(--surface-strong)]'
                : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] border border-transparent hover:bg-[var(--surface-raised)]/40'
            }`}
          >
            {option.icon && <span className="shrink-0">{option.icon}</span>}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
