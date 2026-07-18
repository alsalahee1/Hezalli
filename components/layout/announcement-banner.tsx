"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

// Site-wide dismissible announcement bar. Dismissal is remembered per message
// (keyed by a hash of the text) so a new announcement re-appears.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function AnnouncementBanner({ text }: { text: string }) {
  const key = `hz-ann-${hash(text)}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(localStorage.getItem(key) !== "1");
  }, [key]);

  if (!show) return null;
  return (
    <div className="bg-primary text-primary-foreground relative px-4 py-2 text-center text-sm">
      <span className="pe-6">{text}</span>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(key, "1");
          setShow(false);
        }}
        aria-label="Dismiss"
        className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-black/10"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
