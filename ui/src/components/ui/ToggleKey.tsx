import React from 'react';

export interface ToggleKeyProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'onToggle'> {
  active: boolean;
  onToggle?: (nextActive: boolean) => void;
  label?: string;
  icon?: React.ReactNode;
  ledColor?: 'accent' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const ToggleKey = React.forwardRef<HTMLButtonElement, ToggleKeyProps>(
  (
    {
      active,
      onToggle,
      label,
      icon,
      ledColor = 'accent',
      size = 'md',
      children,
      className = '',
      disabled,
      onClick,
      ...props
    },
    ref
  ) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      onToggle?.(!active);
      onClick?.(e);
    };

    const ledColorClasses = {
      accent: active ? 'bg-[var(--accent)]' : 'bg-[var(--surface-strong)]',
      success: active ? 'bg-[var(--status-success)]' : 'bg-[var(--surface-strong)]',
      warning: active ? 'bg-[var(--status-warning)]' : 'bg-[var(--surface-strong)]',
      danger: active ? 'bg-[var(--status-danger)]' : 'bg-[var(--surface-strong)]',
    }[ledColor];

    const sizeClasses = {
      sm: 'px-2 py-1 text-xs gap-1.5 min-h-[28px]',
      md: 'px-2.5 py-1.5 text-xs gap-2 min-h-[32px]',
      lg: 'px-3.5 py-2 text-sm gap-2.5 min-h-[38px]',
    }[size];

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={active}
        disabled={disabled}
        onClick={handleClick}
        className={`inline-flex items-center justify-between font-mono uppercase tracking-wider rounded-[2px] border hw-transition select-none cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-1 disabled:opacity-40 disabled:cursor-not-allowed ${
          active
            ? 'bg-[var(--surface-raised)] border-[var(--surface-strong)] text-[var(--text-primary)] font-semibold'
            : 'bg-[var(--surface-panel)] border-[var(--surface-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--surface-strong)]'
        } ${sizeClasses} ${className}`}
        {...props}
      >
        <span className="flex items-center gap-1.5 truncate">
          {icon && <span className="shrink-0">{icon}</span>}
          {label && <span>{label}</span>}
          {children}
        </span>
        {/* Hardware square LED indicator with instant state transition */}
        <span
          data-testid="toggle-key-led"
          className={`w-1.5 h-1.5 rounded-[1px] shrink-0 led-instant ${ledColorClasses}`}
          aria-hidden="true"
        />
      </button>
    );
  }
);

ToggleKey.displayName = 'ToggleKey';
