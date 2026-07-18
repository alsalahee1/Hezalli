"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";

import {
  setProductFeatured,
  setStoreFeatured,
} from "@/lib/actions/merchandising";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function FeatureToggle({
  id,
  kind,
  initial,
  label,
}: {
  id: string;
  kind: "product" | "store";
  initial: boolean;
  label: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !on;
          setOn(next);
          const res =
            kind === "product"
              ? await setProductFeatured(id, next)
              : await setStoreFeatured(id, next);
          if (res.error) setOn(!next);
          else router.refresh();
        })
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm",
        on
          ? "border-amber-400 bg-amber-400/10 text-amber-600"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      <Star className={cn("size-4", on && "fill-amber-400 text-amber-400")} />
      {label}
    </button>
  );
}
