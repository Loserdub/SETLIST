import React from 'react';

export interface ExitConfirmModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ExitConfirmModal: React.FC<ExitConfirmModalProps> = ({
  isOpen,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="absolute inset-0 z-50 bg-black/85 flex items-center justify-center font-mono"
      data-testid="stage-exit-confirm"
    >
      <div className="bg-surface-panel border border-border-base p-6 max-w-sm text-center space-y-4 rounded-none">
        <h3 className="text-xs font-bold uppercase tracking-widest text-white">Exit Stage Mode?</h3>
        <p className="text-content-muted text-xs leading-relaxed font-sans">
          You will return to the setlist editor. Performance timer will be reset.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 border border-border-base bg-surface-raised text-content-muted hover:text-white transition-colors text-xs uppercase cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:outline-none"
            data-testid="stage-exit-cancel"
          >
            [ STAY ]
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-1.5 border border-status-danger-dim bg-status-danger-dim text-status-danger hover:bg-status-danger-dim transition-colors text-xs font-semibold uppercase cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
            data-testid="stage-exit-confirm-btn"
          >
            [ EXIT STAGE ]
          </button>
        </div>
      </div>
    </div>
  );
};
