import { createContext, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren } from 'react';

export type ToastAction = { label: string; hint?: string; onPress: () => void };
type Toast = { id: number; message: string; action?: ToastAction };
const ToastActionContext = createContext<(message: string, action?: ToastAction) => void>(() => undefined);
const ToastStateContext = createContext<{ toast: Toast | null; dismiss: (id: number) => void; runAction: (id: number) => void }>({
  toast: null, dismiss: () => undefined, runAction: () => undefined,
});

export function AppToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<Toast | null>(null);
  const currentToast = useRef<Toast | null>(null);
  const nextId = useRef(0);
  const showToast = useCallback((message: string, action?: ToastAction) => {
    if (message.trim()) {
      currentToast.current = { id: ++nextId.current, message, action };
      setToast(currentToast.current);
    }
  }, []);
  const dismiss = useCallback((id: number) => {
    if (currentToast.current?.id !== id) return;
    currentToast.current = null;
    setToast(null);
  }, []);
  const runAction = useCallback((id: number) => {
    const current = currentToast.current;
    if (current?.id !== id || !current.action) return;
    // Consume before invoking, so a double tap or an old handler cannot run twice.
    dismiss(id);
    current.action.onPress();
  }, [dismiss]);
  const value = useMemo(() => ({ toast, dismiss, runAction }), [toast, dismiss, runAction]);
  return <ToastActionContext.Provider value={showToast}>
    <ToastStateContext.Provider value={value}>{children}</ToastStateContext.Provider>
  </ToastActionContext.Provider>;
}

export function useAppToast() { return useContext(ToastActionContext); }
export function useToastState() { return useContext(ToastStateContext); }
