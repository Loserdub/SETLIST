import React from 'react';

export interface PanelProps {
  caption?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  dataTestId?: string;
}

export const Panel: React.FC<PanelProps> = ({
  caption,
  action,
  children,
  className = '',
  dataTestId,
}) => {
  return (
    <div
      data-testid={dataTestId}
      className={`bg-[var(--surface-panel)] border border-[var(--surface-hairline)] rounded-[4px] overflow-hidden flex flex-col ${className}`}
    >
      {(caption || action) && (
        <div className="px-3 py-2 border-b border-[var(--surface-hairline)] flex items-center justify-between gap-2 shrink-0 select-none">
          {caption && (
            <span className="text-xs font-mono font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] truncate">
              {caption}
            </span>
          )}
          {action && <div className="flex items-center gap-1.5 shrink-0">{action}</div>}
        </div>
      )}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
};
