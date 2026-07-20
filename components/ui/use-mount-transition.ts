"use client";

import { useEffect, useState } from "react";

// Drives an enter/leave CSS transition for a conditionally-shown overlay
// (modal, sheet, drawer, dropdown). `mounted` keeps the node in the DOM through
// the closing animation; `shown` toggles the enter/leave classes. A double
// requestAnimationFrame guarantees the closed state is painted once before we
// flip to open, so the enter transition always plays instead of snapping.
export function useMountTransition(open: boolean, duration = 300) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setShown(false);
    const id = setTimeout(() => setMounted(false), duration);
    return () => clearTimeout(id);
  }, [open, duration]);

  return { mounted, shown };
}
