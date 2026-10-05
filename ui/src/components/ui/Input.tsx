import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  caption?: string;
  error?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ caption, error, leftAddon, rightAddon, className = '', id, ...props }, ref) => {
    const inputId = id || (caption ? `input-${caption.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className="flex flex-col gap-1 w-full">
        {caption && (
          <label
            htmlFor={inputId}
            className="text-xs font-mono font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] select-none"
          >
            {caption}
          </label>
        )}
        <div className="relative flex items-center bg-[var(--surface-app)] border border-[var(--surface-hairline)] rounded-[2px] focus-within:border-[var(--surface-strong)] hw-transition w-full">
          {leftAddon && (
            <span className="pl-2.5 pr-1 text-[var(--text-muted)] flex items-center shrink-0">
              {leftAddon}
            </span>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`w-full bg-transparent px-2.5 py-1 text-sm font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] rounded-[2px] focus:outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-1 disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
            {...props}
          />
          {rightAddon && (
            <span className="pr-2.5 pl-1 text-[var(--text-muted)] flex items-center shrink-0">
              {rightAddon}
            </span>
          )}
        </div>
        {error && (
          <span className="text-xs font-mono text-[var(--status-danger)] tracking-wide">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
