"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useMountTransition } from "@/components/ui/use-mount-transition";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Lightweight modal dialog: a backdrop + centered card (bottom sheet on phones)
// rendered through a portal on <body>. Closes on Escape, backdrop click, or the
// corner button; locks background scroll while open. Opens and closes with a
// smooth transition — the node stays mounted through the exit animation before
// it unmounts. Callers provide their own heading/content.
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
  const { mounted, shown } = useMountTransition(open);
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without making it an effect dependency — callers
  // pass an inline arrow, so depending on it would re-run the focus setup on
  // every parent render (each keystroke), stealing focus out of inputs and
  // dismissing the mobile keyboard.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!mounted) return;
    // Remember what had focus so it can be restored when the dialog closes, then
    // move focus into the panel (screen-reader / keyboard users start inside it,
    // not stranded on the now-inert page behind an aria-modal dialog).
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusFirst = () => {
      const target =
        panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel ?? null;
      target?.focus();
    };
    focusFirst();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      // Trap Tab within the panel.
      if (e.key === "Tab" && panel) {
        const items = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => el.offsetParent !== null);
        if (items.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      // Restore focus to the trigger so keyboard users don't lose their place.
      previouslyFocused?.focus?.();
    };
  }, [mounted]);

  if (!mounted || typeof document === "undefined") return null;

  // A gentle "ease-out" curve that decelerates into place — reads as native.
  const ease = "ease-[cubic-bezier(0.32,0.72,0,1)]";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={cn(
          "absolute inset-0 bg-black/50 transition-opacity duration-300 ease-out motion-reduce:transition-none",
          shown ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "bg-background relative z-10 max-h-[90vh] w-full transform-gpu overflow-y-auto rounded-t-2xl border p-5 shadow-xl transition duration-300 will-change-transform outline-none motion-reduce:transition-none sm:max-w-md sm:rounded-2xl",
          ease,
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
