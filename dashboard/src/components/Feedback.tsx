import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="state-line" role="status">
      <span className="spinner" />
      {label}
    </div>
  );
}

export function ErrorLine({ message }: { message: string | undefined }) {
  return message ? <p className="error-text" role="alert">{message}</p> : null;
}

type Toast = { message: string; tone: "ok" | "bad" };

const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const notify = useCallback((message: string, tone: Toast["tone"] = "ok") => {
    setToast({ message, tone });
    setTimeout(() => setToast((current) => (current?.message === message ? null : current)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      {toast && (
        <div className={`toast ${toast.tone}`} role="status">
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
