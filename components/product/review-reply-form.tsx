"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { replyToReview } from "@/lib/actions/review";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function ReviewReplyForm({ reviewId }: { reviewId: string }) {
  const t = useTranslations("Reviews");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-primary text-xs hover:underline"
      >
        {t("reply")}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder={t("replyPlaceholder")}
        className="w-full rounded-md border bg-transparent p-2 text-sm outline-none"
      />
      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErr(null);
              const res = await replyToReview(reviewId, reply);
              if (res.error) setErr(res.error);
              else {
                setOpen(false);
                router.refresh();
              }
            })
          }
        >
          {t("postReply")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
