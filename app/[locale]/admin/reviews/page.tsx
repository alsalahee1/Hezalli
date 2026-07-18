import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { localizedName } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { StarRating } from "@/components/product/star-rating";
import { ReviewHideToggle } from "@/components/admin/review-moderation";

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const t = await getTranslations("AdminReviews");
  const format = await getFormatter();
  const locale = await getLocale();
  const { filter } = await searchParams;
  const showHidden = filter === "hidden";

  const reviews = await prisma.review.findMany({
    where: showHidden ? { hidden: true } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      product: { select: { slug: true, title: true } },
      buyer: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>

      <div className="flex gap-1 border-b">
        {[
          { key: "all", href: "/admin/reviews" },
          { key: "hidden", href: "/admin/reviews?filter=hidden" },
        ].map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium",
              (tab.key === "hidden") === showHidden
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t(`tab_${tab.key}`)}
          </Link>
        ))}
      </div>

      {reviews.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className={cn(
                "rounded-lg border p-4",
                r.hidden && "bg-muted/40 opacity-70",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <StarRating rating={r.rating} size={14} />
                    <span className="text-muted-foreground text-xs">
                      {r.buyer.name ?? "—"} ·{" "}
                      {format.dateTime(r.createdAt, { dateStyle: "medium" })}
                    </span>
                    {r.hidden ? (
                      <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs font-medium">
                        {t("hidden")}
                      </span>
                    ) : null}
                  </div>
                  <Link
                    href={`/product/${r.product.slug}`}
                    className="text-primary text-sm font-medium hover:underline"
                  >
                    {localizedName(r.product.title, locale)}
                  </Link>
                  {r.comment ? (
                    <p className="text-muted-foreground line-clamp-3 text-sm">
                      {r.comment}
                    </p>
                  ) : null}
                </div>
                <ReviewHideToggle reviewId={r.id} hidden={r.hidden} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
