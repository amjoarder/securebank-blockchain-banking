import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";

const ToastContext = createContext(() => {});

const STYLES = {
  success: { icon: CheckCircle2, cls: "text-emerald-600" },
  error: { icon: XCircle, cls: "text-red-600" },
  info: { icon: Info, cls: "text-brand-600" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (type, title, message) => {
      const id = crypto.randomUUID();
      setToasts((t) => [...t.slice(-3), { id, type, title, message }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2 print:hidden">
        {toasts.map(({ id, type, title, message }) => {
          const { icon: Icon, cls } = STYLES[type] ?? STYLES.info;
          return (
            <div key={id} role="status" className="card pointer-events-auto flex items-start gap-3 p-3.5 shadow-lg">
              <Icon className={`mt-0.5 size-5 shrink-0 ${cls}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                {message && <p className="mt-0.5 text-sm break-words text-slate-600">{message}</p>}
              </div>
              <button onClick={() => dismiss(id)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
