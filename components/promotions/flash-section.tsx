import { Zap } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { localizedName } from "@/lib/categories";
import type { getFlashSales } from "@/lib/flash";
import { formatUsd } from "@/lib/products";
import { Link } from "@/i18n/navigation";
import { Countdown } from "@/components/promotions/countdown";

type Sale = Awaited<ReturnType<typeof getFlashSales>>[number];

export async function FlashSection({
  sale,
  upcoming = false,
}: {
  sale: Sale;
  upcoming?: boolean;
}) {
  const locale = await getLocale();
  const t = await getTranslations("Flash");

  return (
    <section className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-lg bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-2.5 text-white">
        <span className="flex items-center gap-2 font-semibold">
          <Zap className="size-5 fill-white" />
          {localizedName(sale.name, locale)}
        </span>
        <span className="flex items-center gap-2 text-sm">
          {upcoming ? t("startsIn") : t("endsIn")}
          <Countdown
            to={(upcoming ? sale.startsAt : sale.endsAt).toISOString()}
          />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-5">
        {sale.items.slice(0, 10).map((it) => {
          const orig = Number(it.variant.price);
          const sale$ = Number(it.salePrice);
          const pct =
            it.stockLimit && it.stockLimit > 0
              ? Math.min(100, Math.round((it.soldCount / it.stockLimit) * 100))
              : 0;
          const soldOut =
            it.stockLimit != null && it.soldCount >= it.stockLimit;
          const cover = it.variant.product.images[0]?.url ?? null;
          return (
            <Link
              key={it.id}
              href={`/product/${it.variant.product.slug}`}
              className="hover:border-muted-foreground/40 group rounded-lg border p-2"
            >
              <div className="bg-muted relative mb-2 aspect-square overflow-hidden rounded">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
                    alt=""
                    className="size-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : null}
                {soldOut ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold text-white">
                    {t("soldOut")}
                  </span>
                ) : null}
              </div>
              <p className="line-clamp-2 text-xs">
                {localizedName(it.variant.product.title, locale)}
              </p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-rose-600" dir="ltr">
                  {formatUsd(sale$, locale)}
                </span>
                {orig > sale$ ? (
                  <span
                    className="text-muted-foreground text-xs line-through"
                    dir="ltr"
                  >
                    {formatUsd(orig, locale)}
                  </span>
                ) : null}
              </div>
              {it.stockLimit ? (
                <div className="mt-1.5">
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div
                      className="h-full bg-rose-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-[10px]">
                    {t("claimed", { pct })}
                  </p>
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
