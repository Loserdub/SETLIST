import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  caption?: string;
  options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ caption, options, children, className = '', id, ...props }, ref) => {
    const selectId = id || (caption ? `select-${caption.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className="flex flex-col gap-1">
        {caption && (
          <label
            htmlFor={selectId}
            className="text-xs font-mono font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] select-none"
          >
            {caption}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          className={`bg-[var(--surface-app)] border border-[var(--surface-hairline)] text-[var(--text-primary)] text-sm font-mono rounded-[2px] px-2.5 py-1 focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hw-transition ${className}`}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled} className="bg-[var(--surface-panel)] text-[var(--text-primary)]">
                  {opt.label}
                </option>
              ))
            : children}
        </select>
      </div>
    );
  }
);

Select.displayName = 'Select';
