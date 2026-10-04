import { useAppStore, type Toast } from '../store/useAppStore';

export function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const isError = toast.type === 'error';
  const isSuccess = toast.type === 'success';

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid={`toast-${toast.type}`}
      className={`pointer-events-auto flex items-start gap-3 p-3 rounded-none border shadow-2xl transition-all duration-200 max-w-sm font-mono ${
        isError
          ? 'bg-[#120808] border-[#7f1d1d] text-[#fca5a5]'
          : isSuccess
          ? 'bg-[#081208] border-[#166534] text-[#86efac]'
          : 'bg-[#0c0c0c] border-[#27272a] text-[#ededed]'
      }`}
    >
      <div className="shrink-0 text-xs font-bold mt-0.5">
        {isError ? '[!]' : isSuccess ? '[✓]' : '[i]'}
      </div>

      <div className="flex-1 min-w-0 pr-1">
        <p className="text-xs font-semibold leading-tight text-white">
          {toast.message}
        </p>
        {toast.details && (
          <p className="text-xs text-[#a8a8a8] mt-1 break-words leading-relaxed line-clamp-3">
            {toast.details}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 text-[#a8a8a8] hover:text-white transition-colors cursor-pointer text-xs p-0.5 rounded-none hover:bg-[#1f1f1f] focus-visible:ring-2 focus-visible:ring-[#38bdf8] focus-visible:outline-none"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useAppStore((state) => state.toasts);
  const removeToast = useAppStore((state) => state.removeToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="toast-container"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 pointer-events-none max-w-sm"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}

export default ToastContainer;
