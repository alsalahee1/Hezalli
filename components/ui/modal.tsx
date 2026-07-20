"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

// Lightweight modal dialog: a backdrop + centered card (bottom sheet on phones)
// rendered through a portal on <body>. Closes on Escape, backdrop click, or the
// corner button; locks background scroll while open. Opens and closes with a
// smooth transition — the element stays mounted through the exit animation
// before it unmounts. Callers provide their own heading/content.
export function Modal({
  open,
  onClose,
  closeLabel = "Close",
  children,
}: {
  open: boolean;
  onClose: () => void;
  closeLabel?: string;
  children: React.ReactNode;
}) {
  // `mounted` keeps the node in the DOM through the closing animation; `shown`
  // drives the enter/leave CSS transition (toggled a frame after mount).
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const id = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none",
          shown ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          "bg-background relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border p-5 shadow-xl transition duration-200 ease-out will-change-transform motion-reduce:transition-none sm:max-w-md sm:rounded-2xl",
          shown
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-full opacity-0 sm:translate-y-0 sm:scale-95",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="hover:bg-muted text-muted-foreground absolute end-3 top-3 inline-flex size-8 items-center justify-center rounded-md transition-colors"
        >
          <X className="size-5" />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
