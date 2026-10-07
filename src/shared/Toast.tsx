import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Toast = { id: number; text: string; action?: { label: string; run: () => void } };
const Ctx = createContext<(text: string, action?: Toast["action"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number>(0);
  const show = useCallback((text: string, action?: Toast["action"]) => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), text, action });
    timer.current = window.setTimeout(() => setToast(null), action ? 8000 : 2600);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div role="status" className="fixed inset-x-3 bottom-20 md:bottom-6 md:left-auto md:right-6 md:w-96 z-50 flex items-center gap-3 rounded-xl bg-ink px-4 py-3 text-white shadow-lg">
          <span className="flex-1">{toast.text}</span>
          {toast.action && (
            <button className="font-bold text-sage-soft underline" onClick={() => { toast.action!.run(); setToast(null); }}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
