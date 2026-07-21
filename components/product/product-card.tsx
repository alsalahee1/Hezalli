import { useTranslations } from "next-intl";

import type { ProductCardItem } from "@/lib/products";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { StarRating } from "@/components/product/star-rating";
import { WishlistHeart } from "@/components/product/wishlist-heart";

export function ProductCard({
  item,
  className,
}: {
  item: ProductCardItem;
  className?: string;
}) {
  const t = useTranslations("Product");
  return (
    // Stretched-link pattern: the card is a plain container and the title holds
    // the navigation link whose ::after overlay covers the whole card. The
    // wishlist button is a SIBLING of that link (not nested inside it), so the
    // markup is valid and the two interactive controls don't overlap semantically.
    <div
      className={cn(
        "group bg-card relative flex flex-col overflow-hidden rounded-lg border transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="bg-muted relative aspect-square overflow-hidden">
        {item.cover ? (
          // Raw <img> is deliberate: product images come from same-origin
          // /api/files or a runtime-configured S3 host that next/image's static
          // remotePatterns can't enumerate. The aspect-square wrapper prevents CLS.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.cover}
            alt={item.title}
            loading="lazy"
            decoding="async"
            className={cn(
              "size-full object-cover transition-transform duration-300 group-hover:scale-105",
              item.outOfStock && "opacity-50",
            )}
          />
        ) : null}
        {item.pctOff ? (
          <span className="bg-destructive absolute start-2 top-2 rounded px-1.5 py-0.5 text-xs font-semibold text-white">
            -{item.pctOff}%
          </span>
        ) : null}
        {item.condition === "USED" ? (
          <span className="bg-foreground/80 absolute end-2 top-9 rounded px-1.5 py-0.5 text-xs font-medium text-white">
            {t("used")}
          </span>
        ) : null}
        <WishlistHeart
          productId={item.id}
          size={15}
          className="absolute end-2 top-2 z-20"
        />
        {item.outOfStock ? (
          <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-xs font-medium text-white">
            {t("outOfStock")}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-medium">
          <Link
            href={`/product/${item.slug}`}
            className="outline-none after:absolute after:inset-0 focus-visible:underline"
          >
            {item.title}
          </Link>
        </h3>

        {item.ratingCount > 0 ? (
          <div className="flex items-center gap-1">
            <StarRating rating={item.rating} size={12} />
            <span className="text-muted-foreground text-xs">
              ({item.ratingCount})
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">
            {t("noReviews")}
          </span>
        )}

        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1">
          <span className="text-base font-semibold" dir="ltr">
            {item.priceLabel}
            {item.priceMaxLabel ? (
              <span className="text-muted-foreground font-normal">
                {" "}
                – {item.priceMaxLabel}
              </span>
            ) : null}
          </span>
          {item.compareAtLabel ? (
            <span
              className="text-muted-foreground text-xs line-through"
              dir="ltr"
            >
              {item.compareAtLabel}
            </span>
          ) : null}
        </div>

        {item.storeName ? (
          <span className="text-muted-foreground truncate text-xs">
            {item.storeName}
          </span>
        ) : null}
      </div>
    </div>
  );
}
