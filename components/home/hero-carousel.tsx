"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type HeroBanner = {
  id: string;
  image: string;
  href: string | null;
  title: string;
};

export function HeroCarousel({ banners }: { banners: HeroBanner[] }) {
  const [index, setIndex] = useState(0);
  const count = banners.length;

  const go = useCallback(
    (n: number) => setIndex(((n % count) + count) % count),
    [count],
  );

  useEffect(() => {
    if (count <= 1) return;
    const id = window.setInterval(() => go(index + 1), 5000);
    return () => window.clearInterval(id);
  }, [index, count, go]);

  if (count === 0) return null;

  return (
    <div className="group relative aspect-[16/6] w-full overflow-hidden rounded-xl border">
      {banners.map((b, i) => {
        const inner = (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.image} alt={b.title} className="size-full object-cover" />
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
              <Link href={b.href} className="block size-full">
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
            aria-label="Previous"
            className="absolute start-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <ChevronLeft className="size-5 rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next"
            className="absolute end-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <ChevronRight className="size-5 rtl:rotate-180" />
          </button>
          <div className="absolute start-1/2 bottom-3 flex -translate-x-1/2 gap-1.5 rtl:translate-x-1/2">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Slide ${i + 1}`}
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
