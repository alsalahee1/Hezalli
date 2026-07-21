"use client";

import { useEffect } from "react";

import { useMountTransition } from "@/components/ui/use-mount-transition";

// Shared lifecycle for the app's dropdown/popover overlays (user menu,
// notification bell, …), so the outside-click backdrop, Escape-to-close, and
// mount/exit transition live in ONE place instead of being hand-rolled per
// component. The panel itself is a render prop: each caller keeps its exact
// markup/positioning/animation and just consumes `shown` for its transition
// classes. Anchor the whole thing in a `relative` container next to the trigger.
export function Popover({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: (shown: boolean) => React.ReactNode;
}) {
  const { mounted, shown } = useMountTransition(open, 200);

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <>
      {/* Click/tap anywhere outside the panel closes it. */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      {children(shown)}
    </>
  );
}
