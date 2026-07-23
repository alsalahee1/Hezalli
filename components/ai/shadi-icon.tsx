import { cn } from "@/lib/utils";

/**
 * One-color glyph of Shadi (شادي), the AI assistant — a minimal line-icon
 * take on the brand artwork: keffiyeh dome with the agal cord and dark
 * sunglasses. Drawn to lucide conventions (24×24 viewBox, 2px rounded
 * strokes, currentColor) so it drops in anywhere a lucide icon fits.
 */
export function ShadiIcon({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
      className={cn("shrink-0", className)}
    >
      {/* Keffiyeh dome */}
      <path d="M5 10a7 7 0 0 1 14 0" />
      {/* Agal cord across the wrap */}
      <path d="M6.3 6.9h11.4" />
      {/* Face and bearded chin */}
      <path d="M5 10v1c0 4.5 3 8 7 8s7-3.5 7-8v-1" />
      {/* Sunglasses */}
      <rect
        x="7.2"
        y="11"
        width="3.6"
        height="2.8"
        rx="1.2"
        fill="currentColor"
        stroke="none"
      />
      <rect
        x="13.2"
        y="11"
        width="3.6"
        height="2.8"
        rx="1.2"
        fill="currentColor"
        stroke="none"
      />
      <path d="M10.8 12.2h2.4" strokeWidth="1.5" />
    </svg>
  );
}
