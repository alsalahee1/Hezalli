"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Lightweight modal dialog: a backdrop + centered card (bottom sheet on phones)
// rendered through a portal on <body>. Closes on Escape, backdrop click, or the
// corner button; locks background scroll while open. Callers provide their own
// heading/content.
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
  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="bg-background relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="hover:bg-muted text-muted-foreground absolute end-3 top-3 inline-flex size-8 items-center justify-center rounded-md"
        >
          <X className="size-5" />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
