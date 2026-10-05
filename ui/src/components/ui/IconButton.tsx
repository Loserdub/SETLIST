import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tooltip?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      label,
      tooltip,
      variant = 'secondary',
      size = 'md',
      icon,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseClasses =
      'inline-flex items-center justify-center transition-colors duration-100 ease-out cursor-pointer rounded-[2px] select-none focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-1 disabled:opacity-40 disabled:cursor-not-allowed shrink-0';

    const sizeClasses = {
      sm: 'w-6 h-6 text-xs p-1',
      md: 'w-8 h-8 text-sm p-1.5',
      lg: 'w-10 h-10 text-base p-2',
    }[size];

    const variantClasses = {
      primary:
        'bg-[var(--accent)] text-[var(--accent-text)] border border-transparent hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]',
      secondary:
        'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--surface-hairline)] hover:bg-[var(--surface-strong)] active:bg-[var(--surface-panel)]',
      ghost:
        'bg-transparent text-[var(--text-secondary)] border border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)]',
      danger:
        'bg-transparent text-[var(--status-danger)] border border-[var(--status-danger)]/40 hover:bg-[var(--status-danger)]/15 hover:border-[var(--status-danger)] active:bg-[var(--status-danger)]/25',
    }[variant];

    const displayTooltip = tooltip || label;

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        aria-label={label}
        title={displayTooltip}
        className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {icon || children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
