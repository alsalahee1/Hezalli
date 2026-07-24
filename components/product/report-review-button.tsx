"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";

import { reportReview } from "@/lib/actions/review";

export function ReportReviewButton({ reviewId }: { reviewId: string }) {
  const t = useTranslations("Reviews");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <span className="text-muted-foreground text-xs">{t("reported")}</span>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await reportReview(reviewId);
          setDone(true);
        })
      }
      className="text-muted-foreground hover:text-foreground inline-flex min-h-8 items-center gap-1 text-xs"
    >
      <Flag className="size-3" /> {t("report")}
    </button>
  );
}
