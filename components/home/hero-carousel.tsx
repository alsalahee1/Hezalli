"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { SmartImage } from "@/components/ui/smart-image";

export type HeroBanner = {
  id: string;
  image: string;
  href: string | null;
  title: string;
};

export function HeroCarousel({ banners }: { banners: HeroBanner[] }) {
  const t = useTranslations("A11y");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;

  const go = useCallback(
    (n: number) => setIndex(((n % count) + count) % count),
    [count],
  );

  useEffect(() => {
    // Autoplay pauses on hover/focus so it doesn't move content out from under
    // the user (WCAG 2.2.2).
    if (count <= 1 || paused) return;
    const id = window.setInterval(() => go(index + 1), 5000);
    return () => window.clearInterval(id);
  }, [index, count, go, paused]);

  if (count === 0) return null;

  return (
    <div
      className="group relative aspect-[16/6] w-full overflow-hidden rounded-xl border"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {banners.map((b, i) => {
        const inner = (
          <SmartImage
            src={b.image}
            alt={b.title}
            fill
            // The first banner is the above-the-fold LCP — preload it.
            priority={i === 0}
            sizes="100vw"
            className="object-cover"
          />
        );
        return (
          <div
            key={b.id}
            className={cn(
              "absolute inset-0 transition-opacity duration-700",
              i === index ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            aria-hidden={i !== index}
          >
            {b.href ? (
              <Link href={b.href} className="relative block size-full">
                {inner}
              </Link>
            ) : (
              inner
            )}
            {b.title ? (
              <div className="absolute bottom-0 w-full bg-gradient-to-t from-black/60 to-transparent p-4 sm:p-6">
                <p className="text-lg font-semibold text-white sm:text-2xl">
                  {b.title}
                </p>
              </div>
            ) : null}
          </div>
        );
      })}

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label={t("previous")}
            className="absolute start-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <ChevronLeft className="size-5 rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label={t("next")}
            className="absolute end-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <ChevronRight className="size-5 rtl:rotate-180" />
          </button>
          <div className="absolute start-1/2 bottom-3 flex -translate-x-1/2 gap-1.5 rtl:translate-x-1/2">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={t("slide", { n: i + 1 })}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-5 bg-white" : "w-1.5 bg-white/60",
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
