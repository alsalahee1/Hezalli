"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { SmartImage } from "@/components/ui/smart-image";

type GalleryImage = { url: string; alt: string };

export function ProductGallery({ images }: { images: GalleryImage[] }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const list = images.length ? images : [{ url: "", alt: "" }];
  const current = list[Math.min(active, list.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      <div
        className="bg-muted relative aspect-square overflow-hidden rounded-lg border"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setZoom({
            x: ((e.clientX - r.left) / r.width) * 100,
            y: ((e.clientY - r.top) / r.height) * 100,
          });
        }}
        onMouseLeave={() => setZoom(null)}
      >
        {current.url ? (
          <SmartImage
            src={current.url}
            alt={current.alt}
            fill
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="object-cover transition-transform duration-150"
            style={
              zoom
                ? {
                    transform: "scale(1.9)",
                    transformOrigin: `${zoom.x}% ${zoom.y}%`,
                  }
                : undefined
            }
          />
        ) : null}
      </div>

      {list.length > 1 ? (
        <div className="grid grid-cols-5 gap-2">
          {list.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "bg-muted relative aspect-square overflow-hidden rounded-md border-2",
                i === active
                  ? "border-primary"
                  : "hover:border-muted-foreground/30 border-transparent",
              )}
            >
              {img.url ? (
                <SmartImage
                  src={img.url}
                  alt={img.alt}
                  fill
                  sizes="10vw"
                  className="object-cover"
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
