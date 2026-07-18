import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

// Renders 5 stars with a partial fill for the fractional part. Pure/presentational.
export function StarRating({
  rating,
  size = 14,
  className,
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span
      className={cn("relative inline-flex", className)}
      aria-label={`${rating.toFixed(1)} / 5`}
      dir="ltr"
    >
      <span className="flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className="text-muted-foreground/30"
            style={{ width: size, height: size }}
          />
        ))}
      </span>
      <span
        className="absolute inset-0 flex overflow-hidden"
        style={{ width: `${pct}%` }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className="fill-amber-400 text-amber-400"
            style={{ width: size, height: size }}
          />
        ))}
      </span>
    </span>
  );
}
