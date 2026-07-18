"use client";

import { useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { setReviewHidden } from "@/lib/actions/review";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function ReviewHideToggle({
  reviewId,
  hidden,
}: {
  reviewId: string;
  hidden: boolean;
}) {
  const t = useTranslations("AdminReviews");
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      className={hidden ? "" : "text-destructive"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setReviewHidden(reviewId, !hidden);
          router.refresh();
        })
      }
    >
      {hidden ? (
        <>
          <Eye className="size-4" /> {t("unhide")}
        </>
      ) : (
        <>
          <EyeOff className="size-4" /> {t("hide")}
        </>
      )}
    </Button>
  );
}
