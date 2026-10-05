import React, { useEffect, useRef } from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  dataTestId?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'md',
  dataTestId,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
  }[maxWidth];

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid={dataTestId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 hw-transition"
    >
      <div
        ref={dialogRef}
        className={`w-full ${maxWidthClasses} bg-[var(--surface-panel)] border border-[var(--surface-hairline)] rounded-[4px] overflow-hidden flex flex-col hw-transition select-none`}
      >
        {/* Header */}
        {title && (
          <div className="px-4 py-3 border-b border-[var(--surface-hairline)] flex items-center justify-between gap-2 shrink-0">
            <span className="text-xs font-mono font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] truncate">
              {title}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer text-xs font-mono px-1.5 py-0.5 rounded-[2px] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-4 flex-1 text-sm font-sans text-[var(--text-primary)]">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-4 py-3 border-t border-[var(--surface-hairline)] bg-[var(--surface-app)] flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
