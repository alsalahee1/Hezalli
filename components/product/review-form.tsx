"use client";

import { useState, useTransition } from "react";
import { Star, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { createReview, updateReview } from "@/lib/actions/review";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImageUploader } from "@/components/upload/image-uploader";

export type ReviewDraft = {
  reviewId: string;
  rating: number;
  comment: string;
  images: string[];
};

export function ReviewForm({
  productId,
  subOrderId,
  existing,
}: {
  productId: string;
  subOrderId?: string;
  existing?: ReviewDraft;
}) {
  const t = useTranslations("Reviews");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(Boolean(existing));
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [images, setImages] = useState<string[]>(existing?.images ?? []);
  const [err, setErr] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setErr(null);
      if (rating < 1) {
        setErr("ratingRequired");
        return;
      }
      const res = existing
        ? await updateReview({
            reviewId: existing.reviewId,
            rating,
            comment,
            images,
          })
        : await createReview({
            productId,
            subOrderId: subOrderId!,
            rating,
            comment,
            images,
          });
      if (res.error) {
        setErr(res.error);
        return;
      }
      router.refresh();
      if (!existing) setOpen(false);
    });

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Star className="size-4" /> {t("writeReview")}
      </Button>
    );
  }

  const shown = hover || rating;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="font-medium">
        {existing ? t("editYourReview") : t("writeReview")}
      </p>
      <div className="flex items-center gap-1" dir="ltr">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`${n}`}
          >
            <Star
              className={cn(
                "size-7 transition-colors",
                n <= shown
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/40",
              )}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={t("commentPlaceholder")}
        className="w-full rounded-md border bg-transparent p-3 text-sm outline-none"
      />

      <div className="flex flex-wrap items-center gap-2">
        {images.map((url) => (
          <div
            key={url}
            className="relative size-16 overflow-hidden rounded border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => setImages((imgs) => imgs.filter((u) => u !== url))}
              className="absolute end-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
              aria-label={t("removePhoto")}
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {images.length < 5 ? (
          <ImageUploader
            folder="products"
            label={t("addPhoto")}
            onUploaded={(url) =>
              setImages((imgs) => [...imgs, url].slice(0, 5))
            }
          />
        ) : null}
      </div>

      {err ? (
        <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
        {existing ? null : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            {t("cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}
