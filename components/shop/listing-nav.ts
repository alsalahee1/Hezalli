"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";

import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * Returns a setter that patches the current query string and navigates, so all
 * listing state lives in the URL (shareable, back-button friendly). Changing a
 * filter resets pagination.
 */
export function useListingNav() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  return useCallback(
    (updates: Record<string, string | number | null>, resetPage = true) => {
      const params = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === "") params.delete(k);
        else params.set(k, String(v));
      }
      if (resetPage) params.delete("page");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, sp],
  );
}
