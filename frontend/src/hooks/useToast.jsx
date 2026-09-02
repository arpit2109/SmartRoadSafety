/**
 * useToast — lightweight toast notifications.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast('Saved!', 'success');
 *   toast('Something went wrong', 'error');
 *   toast('Processing…', 'info');
 */
import { useCallback, useState } from 'react';

const DURATION = 3500;

export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, DURATION);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toast, dismiss, toasts };
};

// ---------------------------------------------------------------------------
// Toast renderer — drop <ToastContainer /> once in Layout or App
// ---------------------------------------------------------------------------

export const ToastContainer = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;

  const icon = (type) => {
    if (type === 'success') return '✓';
    if (type === 'error') return '✕';
    return 'ℹ';
  };

  const bg = (type) => {
    if (type === 'success') return 'bg-green-50 border-green-200 text-green-800';
    if (type === 'error') return 'bg-red-50 border-red-200 text-red-800';
    return 'bg-blue-50 border-blue-200 text-blue-800';
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-md text-sm font-medium min-w-[280px] max-w-sm ${bg(t.type)}`}
        >
          <span className="shrink-0">{icon(t.type)}</span>
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="shrink-0 opacity-60 hover:opacity-100 text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
