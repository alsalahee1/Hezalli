import { cn } from "@/lib/utils";

const BRAND_TURQUOISE = "#14A8A3";
const BRAND_GOLD = "#E8B13A";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cn("size-8", className)}
      aria-hidden
    >
      <rect x="2" y="2" width="44" height="44" rx="14" fill={BRAND_TURQUOISE} />
      <path
        d="M14 26c0-7.5 4.8-12.5 10-12.5s10 5 10 12.5"
        fill="none"
        stroke="#fff"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M15 30.5l6 6 12-13"
        fill="none"
        stroke={BRAND_GOLD}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  markClassName,
  showWordmark = true,
  wordmark,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
  wordmark: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      {showWordmark ? (
        <span className="text-xl font-bold tracking-tight">{wordmark}</span>
      ) : null}
    </span>
  );
}
