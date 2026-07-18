import { BadgeCheck } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import {
  getReviews,
  getReviewSummary,
  parseReviewSort,
  REVIEW_SORTS,
  REVIEWS_PAGE_SIZE,
} from "@/lib/reviews";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { StarRating } from "@/components/product/star-rating";
import { ReviewForm, type ReviewDraft } from "@/components/product/review-form";
import { ReviewReplyForm } from "@/components/product/review-reply-form";
import { ReportReviewButton } from "@/components/product/report-review-button";

export async function ProductReviews({
  productId,
  slug,
  sort: sortRaw,
  page: pageRaw,
  canReview,
  reviewSubOrderId,
  myReview,
  isStoreOwner,
}: {
  productId: string;
  slug: string;
  sort?: string;
  page?: string;
  canReview: boolean;
  reviewSubOrderId?: string;
  myReview: ReviewDraft | null;
  isStoreOwner: boolean;
}) {
  const t = await getTranslations("Reviews");
  const format = await getFormatter();
  const sort = parseReviewSort(sortRaw);
  const page = Math.max(1, Number(pageRaw) || 1);

  const [summary, { total, reviews }] = await Promise.all([
    getReviewSummary(productId),
    getReviews(productId, sort, page),
  ]);
  const pages = Math.max(1, Math.ceil(total / REVIEWS_PAGE_SIZE));
  const sortHref = (s: string) => `/product/${slug}?rsort=${s}#reviews`;

  return (
    <section id="reviews" className="mt-12 scroll-mt-20">
      <h2 className="mb-4 text-xl font-semibold tracking-tight">
        {t("title")}
      </h2>

      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        {/* Summary */}
        <div className="space-y-4">
          <div className="rounded-lg border p-4 text-center">
            <div className="text-4xl font-bold">{summary.avg.toFixed(1)}</div>
            <StarRating rating={summary.avg} size={18} className="mt-1" />
            <p className="text-muted-foreground mt-1 text-sm">
              {t("basedOn", { count: summary.count })}
            </p>
          </div>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const n = summary.dist[star] ?? 0;
              const pct = summary.count ? (n / summary.count) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-6 text-end">{star}★</span>
                  <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                    <div
                      className="h-full bg-amber-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground w-6">{n}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* List + controls */}
        <div className="space-y-4">
          {canReview || myReview ? (
            <ReviewForm
              productId={productId}
              subOrderId={reviewSubOrderId}
              existing={myReview ?? undefined}
            />
          ) : null}

          <div className="flex flex-wrap gap-1 border-b pb-2">
            {REVIEW_SORTS.map((s) => (
              <Link
                key={s}
                href={sortHref(s)}
                scroll={false}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  sort === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {t(`sort_${s}`)}
              </Link>
            ))}
          </div>

          {reviews.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
              {t("empty")}
            </div>
          ) : (
            <ul className="space-y-4">
              {reviews.map((r) => (
                <li
                  key={r.id}
                  className="space-y-2 border-b pb-4 last:border-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {r.buyer.name ?? t("anonymous")}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-600">
                        <BadgeCheck className="size-3" /> {t("verified")}
                      </span>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {format.dateTime(r.createdAt, { dateStyle: "medium" })}
                    </span>
                  </div>
                  <StarRating rating={r.rating} size={14} />
                  {r.comment ? (
                    <p className="text-sm whitespace-pre-line">{r.comment}</p>
                  ) : null}
                  {r.images.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {r.images.map((img) => (
                        <a
                          key={img.id}
                          href={img.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="size-16 overflow-hidden rounded border"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.url}
                            alt=""
                            className="size-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {r.storeReply ? (
                    <div className="bg-muted/50 rounded-md p-3 text-sm">
                      <p className="mb-1 text-xs font-semibold">
                        {t("sellerReply")}
                      </p>
                      <p className="whitespace-pre-line">{r.storeReply}</p>
                    </div>
                  ) : isStoreOwner ? (
                    <ReviewReplyForm reviewId={r.id} />
                  ) : null}

                  <div className="flex justify-end">
                    <ReportReviewButton reviewId={r.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {pages > 1 ? (
            <div className="flex items-center justify-center gap-2 pt-2 text-sm">
              {page > 1 ? (
                <Link
                  href={`/product/${slug}?rsort=${sort}&rpage=${page - 1}#reviews`}
                  scroll={false}
                  className="hover:bg-muted rounded-md border px-3 py-1.5"
                >
                  {t("prev")}
                </Link>
              ) : null}
              <span className="text-muted-foreground">
                {t("pageOf", { page, pages })}
              </span>
              {page < pages ? (
                <Link
                  href={`/product/${slug}?rsort=${sort}&rpage=${page + 1}#reviews`}
                  scroll={false}
                  className="hover:bg-muted rounded-md border px-3 py-1.5"
                >
                  {t("next")}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
