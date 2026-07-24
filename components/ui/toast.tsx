"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useMountTransition } from "@/components/ui/use-mount-transition";

type ToastVariant = "success" | "error";

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
  open: boolean;
};

type ToastContextValue = {
  toast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

/**
 * App-wide toast/snackbar notifications — the in-app substitute for the
 * ad-hoc "Saved!" banners forms used to render inline. Mounted once in the
 * locale root layout; call `useToast().toast(message)` from any client
 * component after a successful action.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const close = useCallback((id: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, open: false } : item)),
    );
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = ++idRef.current;
      setItems((prev) => [...prev, { id, message, variant, open: true }]);
      setTimeout(() => close(id), AUTO_DISMISS_MS);
    },
    [close],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6"
              aria-live="polite"
            >
              {items.map((item) => (
                <ToastCard
                  key={item.id}
                  item={item}
                  onClose={() => close(item.id)}
                  onExited={() => remove(item.id)}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

function ToastCard({
  item,
  onClose,
  onExited,
}: {
  item: ToastItem;
  onClose: () => void;
  onExited: () => void;
}) {
  const t = useTranslations("Common");
  const { mounted, shown } = useMountTransition(item.open, 200);

  useEffect(() => {
    if (!mounted) onExited();
  }, [mounted, onExited]);

  if (!mounted) return null;

  const Icon = item.variant === "error" ? XCircle : CheckCircle2;

  return (
    <div
      role={item.variant === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border px-4 py-3 shadow-lg transition duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        item.variant === "error"
          ? "bg-destructive border-destructive text-white"
          : "bg-foreground border-foreground text-background",
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <Icon className="size-5 shrink-0" />
      <p className="min-w-0 flex-1 text-sm font-medium text-pretty">
        {item.message}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("close")}
        className="-me-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full opacity-80 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
