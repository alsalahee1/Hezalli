"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { rateDelivery } from "@/lib/actions/delivery-rating";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// Buyer rates the courier who delivered their Express parcel (1–5 stars +
// optional comment). Shows the existing rating with an "edit" affordance.
export function DeliveryRating({
  shipmentId,
  existing,
}: {
  shipmentId: string;
  existing?: { stars: number; comment: string | null } | null;
}) {
  const t = useTranslations("DeliveryRating");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(!existing);
  const [stars, setStars] = useState(existing?.stars ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    if (stars < 1) {
      setErr("badStars");
      return;
    }
    setErr(null);
    start(async () => {
      const res = await rateDelivery(shipmentId, stars, comment || undefined);
      if (res.error) setErr(res.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  };

  const Stars = ({ interactive }: { interactive: boolean }) => (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = (interactive ? hover || stars : stars) >= i;
        return (
          <button
            key={i}
            type="button"
            disabled={!interactive || pending}
            onClick={() => setStars(i)}
            onMouseEnter={() => interactive && setHover(i)}
            onMouseLeave={() => interactive && setHover(0)}
            className={cn(
              interactive ? "cursor-pointer" : "cursor-default",
              "disabled:cursor-default",
            )}
            aria-label={`${i}`}
          >
            <Star
              className={cn(
                "size-5",
                filled
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/40",
              )}
            />
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 text-sm font-medium">
        {existing && !editing ? t("yourRating") : t("rateCourier")}
      </p>

      {existing && !editing ? (
        <div className="space-y-1">
          <Stars interactive={false} />
          {existing.comment ? (
            <p className="text-muted-foreground text-sm">{existing.comment}</p>
          ) : null}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-primary text-xs hover:underline"
          >
            {t("edit")}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <Stars interactive />
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder={t("commentHint")}
            className="border-input focus-visible:border-primary w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none"
          />
          {err ? <p className="text-destructive text-xs">{t(err)}</p> : null}
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {pending ? t("saving") : t("submit")}
          </button>
        </div>
      )}
    </div>
  );
}
