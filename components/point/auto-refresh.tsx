"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

// Re-fetches the current server page on a fixed interval by calling
// router.refresh(), so a monitor left up on the counter tablet stays live
// without anyone touching it. Pauses while the tab is hidden to avoid churning
// the DB for a screen nobody's looking at. Renders nothing.
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [seconds, router]);
  return null;
}
