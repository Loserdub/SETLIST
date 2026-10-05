import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', icon, children, className = '', disabled, ...props }, ref) => {
    const baseClasses =
      'inline-flex items-center justify-center gap-1.5 font-mono uppercase tracking-wider transition-colors duration-100 ease-out cursor-pointer rounded-[2px] select-none focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-1 disabled:opacity-40 disabled:cursor-not-allowed';

    const sizeClasses = {
      sm: 'px-2 py-1 text-xs',
      md: 'px-3 py-1.5 text-xs',
      lg: 'px-4 py-2 text-sm',
    }[size];

    const variantClasses = {
      primary:
        'bg-[var(--accent)] text-[var(--accent-text)] font-semibold border border-transparent hover:bg-[var(--accent-hover)] active:bg-[var(--accent-pressed)]',
      secondary:
        'bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--surface-hairline)] hover:bg-[var(--surface-strong)] active:bg-[var(--surface-panel)]',
      ghost:
        'bg-transparent text-[var(--text-secondary)] border border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)]',
      danger:
        'bg-transparent text-[var(--status-danger)] border border-[var(--status-danger)]/40 hover:bg-[var(--status-danger)]/15 hover:border-[var(--status-danger)] active:bg-[var(--status-danger)]/25',
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
        {...props}
      >
        {icon && <span className="shrink-0 leading-none">{icon}</span>}
        {children && <span>{children}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
