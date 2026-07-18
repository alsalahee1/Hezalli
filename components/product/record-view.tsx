"use client";

import { useEffect } from "react";

export const RECENT_KEY = "hezalli:recentlyViewed";

// Client-only: remember this product in localStorage so guests get a
// "recently viewed" strip on the home page. Logged-in users are also tracked
// server-side (RecentlyViewed table) from the product page.
export function RecordView({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      const next = [slug, ...list.filter((s) => s !== slug)].slice(0, 20);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // storage disabled / private mode — non-fatal
    }
  }, [slug]);
  return null;
}
