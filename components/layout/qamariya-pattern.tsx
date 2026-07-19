import { cn } from "@/lib/utils";

/**
 * Subtle geometric background evoking Sanaani qamariya window arches.
 * Meant to sit behind content at low opacity, not as a focal element.
 */
export function QamariyaPattern({ className }: { className?: string }) {
  const patternId = "qamariya-pattern";
  return (
    <svg
      className={cn(
        "text-primary pointer-events-none absolute inset-0 size-full opacity-[0.06]",
        className,
      )}
      aria-hidden
    >
      <defs>
        <pattern
          id={patternId}
          width="56"
          height="56"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M8 40C8 26 17 16 28 16s20 10 20 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle
            cx="28"
            cy="16"
            r="3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
