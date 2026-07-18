import { ChevronRight } from "lucide-react";

import type { ProductCardItem } from "@/lib/products";
import { Link } from "@/i18n/navigation";
import { ProductCard } from "@/components/product/product-card";

// A titled row of product cards. Scrolls horizontally on small screens and
// fills a responsive grid on larger ones.
export function ProductStrip({
  title,
  items,
  seeAllHref,
  seeAllLabel,
}: {
  title: string;
  items: ProductCardItem[];
  seeAllHref?: string;
  seeAllLabel?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {seeAllHref ? (
          <Link
            href={seeAllHref}
            className="text-primary flex items-center gap-0.5 text-sm hover:underline"
          >
            {seeAllLabel}
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Link>
        ) : null}
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {items.map((item) => (
          <ProductCard
            key={item.slug}
            item={item}
            className="w-40 shrink-0 sm:w-auto"
          />
        ))}
      </div>
    </section>
  );
}
