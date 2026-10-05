import React from 'react';

export interface EmptyStateProps {
  caption?: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  dataTestId?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  caption,
  title,
  description,
  icon,
  action,
  className = '',
  dataTestId,
}) => {
  return (
    <div
      data-testid={dataTestId}
      className={`max-w-xl mx-auto p-8 border border-[var(--surface-hairline)] bg-[var(--surface-panel)] rounded-[4px] text-center flex flex-col items-center select-none ${className}`}
    >
      {caption && (
        <span className="text-xs font-mono font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-3">
          {caption}
        </span>
      )}
      {icon && <div className="text-[var(--text-muted)] mb-3">{icon}</div>}
      <h3 className="text-sm font-mono font-bold tracking-widest text-[var(--text-primary)] uppercase">
        {title}
      </h3>
      {description && (
        <p className="text-xs font-mono text-[var(--text-secondary)] max-w-md mt-2 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
