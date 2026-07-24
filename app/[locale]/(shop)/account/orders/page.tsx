import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { autoCompleteDeliveredOrders } from "@/lib/actions/completion";
import { expireStaleOrders } from "@/lib/actions/payment";
import { prisma } from "@/lib/prisma";
import {
  ORDER_TABS,
  STATUS_BADGE,
  statusToTab,
  type OrderTab,
} from "@/lib/order-status";
import { Link } from "@/i18n/navigation";
import {
  formatMoney,
  type DisplayCurrencyCode,
} from "@/lib/currency-constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  // Lazily clean up any prepaid orders that were never paid (restores stock)
  // and auto-complete delivered orders past their grace window.
  await expireStaleOrders().catch(() => {});
  await autoCompleteDeliveredOrders().catch(() => {});
  const t = await getTranslations("Orders");
  const format = await getFormatter();
  const locale = await getLocale();

  const sp = await searchParams;
  const tab = (ORDER_TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as OrderTab)
    : "all";

  const orders = await prisma.order.findMany({
    where: { buyerId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      grandTotal: true,
      displayCurrency: true,
      exchangeRate: true,
      createdAt: true,
      subOrders: {
        select: {
          shippingMethod: true,
          store: { select: { name: true } },
          items: {
            select: {
              variantId: true,
              titleSnapshot: true,
              quantity: true,
              unitPrice: true,
            },
          },
        },
      },
    },
  });

  // Thumbnails: map each order-item variant to its product cover image.
  const variantIds = orders.flatMap((o) =>
    o.subOrders.flatMap((s) => s.items.map((i) => i.variantId)),
  );
  const imgRows = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: {
          id: true,
          product: {
            select: {
              images: {
                orderBy: { position: "asc" },
                take: 1,
                select: { url: true },
              },
            },
          },
        },
      })
    : [];
  const imgByVariant = new Map(
    imgRows.map((v) => [v.id, v.product.images[0]?.url ?? null]),
  );

  const filtered =
    tab === "all"
      ? orders
      : orders.filter((o) => statusToTab(o.status) === tab);

  // Each row renders its own checkout-time snapshot (currency + rate frozen
  // on the order), so totals stay what the buyer actually agreed to pay.
  const orderMoney = (o: {
    grandTotal: unknown;
    displayCurrency: string;
    exchangeRate: unknown;
  }) =>
    formatMoney(
      Number(o.grandTotal),
      {
        code: o.displayCurrency as DisplayCurrencyCode,
        rate: Number(o.exchangeRate),
      },
      locale,
    );

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">{t("title")}</h2>

      <div className="flex gap-1 overflow-x-auto border-b">
        {ORDER_TABS.map((tk) => (
          <Link
            key={tk}
            href={
              tk === "all" ? "/account/orders" : `/account/orders?tab=${tk}`
            }
            className={cn(
              "flex min-h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap",
              tab === tk
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t(`tab_${tk}`)}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((o) => {
            const items = o.subOrders.flatMap((s) => s.items);
            const hasExpress = o.subOrders.some(
              (s) => s.shippingMethod === "EXPRESS",
            );
            return (
              <div key={o.id} className="rounded-lg border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">
                    #{o.id.slice(-8).toUpperCase()} ·{" "}
                    {format.dateTime(o.createdAt, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="flex items-center gap-2">
                    {hasExpress ? (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600">
                        {t("expressBadge")}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-medium",
                        STATUS_BADGE[o.status] ?? "bg-muted",
                      )}
                    >
                      {t(`status_${o.status}`)}
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 p-4">
                  {items.slice(0, 4).map((it, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="bg-muted size-12 shrink-0 overflow-hidden rounded">
                        {imgByVariant.get(it.variantId) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imgByVariant.get(it.variantId)!}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : null}
                      </span>
                      <span className="max-w-40 text-xs">
                        <span className="line-clamp-2">{it.titleSnapshot}</span>
                        <span className="text-muted-foreground">
                          ×{it.quantity}
                        </span>
                      </span>
                    </div>
                  ))}
                  {items.length > 4 ? (
                    <span className="text-muted-foreground self-center text-xs">
                      +{items.length - 4}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center justify-between border-t px-4 py-2.5">
                  <span className="text-sm">
                    {t("total")}:{" "}
                    <span className="font-semibold" dir="ltr">
                      {orderMoney(o)}
                    </span>
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/account/orders/${o.id}`}>
                      {t("viewDetails")}
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
