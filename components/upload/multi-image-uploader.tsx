"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { ImageUploader } from "./image-uploader";

export type UploadedImage = { url: string };

// Up to `max` images. First image is the cover. Reorder with the arrows.
export function MultiImageUploader({
  images,
  onChange,
  max = 8,
}: {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  max?: number;
}) {
  const t = useTranslations("SellerProducts");

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(images.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {images.length > 0 ? (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((img, i) => (
            <li
              key={img.url}
              className="bg-muted relative overflow-hidden rounded-lg border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                className="aspect-square w-full object-cover"
              />
              {i === 0 ? (
                <span className="bg-primary text-primary-foreground absolute start-1 top-1 rounded px-1.5 py-0.5 text-xs font-medium">
                  {t("cover")}
                </span>
              ) : null}
              <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={t("moveBack")}
                    className="bg-background/90 hover:bg-background inline-flex size-6 items-center justify-center rounded disabled:opacity-40"
                  >
                    <ChevronLeft className="size-4 rtl:rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === images.length - 1}
                    aria-label={t("moveForward")}
                    className="bg-background/90 hover:bg-background inline-flex size-6 items-center justify-center rounded disabled:opacity-40"
                  >
                    <ChevronRight className="size-4 rtl:rotate-180" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={t("removeImage")}
                  className="bg-background/90 text-destructive hover:bg-background inline-flex size-6 items-center justify-center rounded"
                >
                  <X className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {images.length < max ? (
        <ImageUploader
          folder="products"
          onUploaded={(url) => onChange([...images, { url }])}
          label={t("addImage")}
        />
      ) : (
        <p className="text-muted-foreground text-xs">
          {t("maxImages", { max })}
        </p>
      )}
    </div>
  );
}
