import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Printer } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_BADGE, canBuyerCancel } from "@/lib/order-status";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CancelOrderButton } from "@/components/orders/cancel-order-button";
import { PaymentProofForm } from "@/components/orders/payment-proof-form";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;
  const locale = await getLocale();
  const t = await getTranslations("Orders");
  const format = await getFormatter();

  const order = await prisma.order.findFirst({
    where: { id, buyerId: session.user.id },
    include: {
      address: true,
      payment: true,
      history: { orderBy: { createdAt: "asc" } },
      subOrders: {
        include: { store: { select: { name: true, slug: true } }, items: true },
      },
    },
  });
  if (!order) notFound();

  const variantIds = order.subOrders.flatMap((s) =>
    s.items.map((i) => i.variantId),
  );
  const imgRows = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: {
          id: true,
          product: {
            select: {
              slug: true,
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
  const metaByVariant = new Map(
    imgRows.map((v) => [
      v.id,
      { url: v.product.images[0]?.url ?? null, slug: v.product.slug },
    ]),
  );

  const money = (n: unknown) =>
    format.number(Number(n), { style: "currency", currency: "USD" });

  const futureBtn = (label: string, hint: string) => (
    <span title={hint}>
      <Button size="sm" variant="outline" disabled>
        {label}
      </Button>
    </span>
  );

  return (
    <div className="space-y-6">
      <Link
        href="/account/orders"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("backToOrders")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {t("orderNumber")} #{order.id.slice(-8).toUpperCase()}
          </h2>
          <p className="text-muted-foreground text-sm">
            {format.dateTime(order.createdAt, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
        <span
          className={cn(
            "rounded px-2 py-1 text-sm font-medium",
            STATUS_BADGE[order.status] ?? "bg-muted",
          )}
        >
          {t(`status_${order.status}`)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {canBuyerCancel(order.status) ? (
          <CancelOrderButton orderId={order.id} />
        ) : null}
        {futureBtn(t("track"), t("trackHint"))}
        {futureBtn(t("confirmReceived"), t("confirmHint"))}
        {futureBtn(t("review"), t("reviewHint"))}
        {futureBtn(t("returnItem"), t("returnHint"))}
        <Button asChild size="sm" variant="ghost">
          <a href={`/${locale}/invoice/${order.id}`} target="_blank">
            <Printer className="size-4" /> {t("invoice")}
          </a>
        </Button>
      </div>

      {/* Payment (unpaid prepaid orders) */}
      {order.status === "PENDING" &&
      order.paymentMethod !== "COD" &&
      order.payment ? (
        <PaymentProofForm
          orderId={order.id}
          method={order.paymentMethod as "BANK_TRANSFER" | "USDT" | "WALLET"}
          paymentStatus={order.payment.status}
        />
      ) : null}

      {/* Timeline */}
      <section className="rounded-lg border p-4">
        <h3 className="mb-3 font-medium">{t("timeline")}</h3>
        <ol className="space-y-3">
          {order.history.map((h) => (
            <li key={h.id} className="flex gap-3 text-sm">
              <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" />
              <span>
                <span className="font-medium">{t(`status_${h.status}`)}</span>
                {h.note ? (
                  <span className="text-muted-foreground"> — {h.note}</span>
                ) : null}
                <br />
                <span className="text-muted-foreground text-xs">
                  {format.dateTime(h.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Items per seller */}
      {order.subOrders.map((s) => (
        <section key={s.id} className="rounded-lg border">
          <div className="border-b px-4 py-2.5 text-sm font-medium">
            {s.store.name}
          </div>
          <ul className="divide-y">
            {s.items.map((it) => {
              const meta = metaByVariant.get(it.variantId);
              return (
                <li key={it.id} className="flex gap-3 p-4">
                  <span className="bg-muted size-16 shrink-0 overflow-hidden rounded">
                    {meta?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={meta.url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    {meta?.slug ? (
                      <Link
                        href={`/product/${meta.slug}`}
                        className="line-clamp-2 font-medium hover:underline"
                      >
                        {it.titleSnapshot}
                      </Link>
                    ) : (
                      <span className="line-clamp-2 font-medium">
                        {it.titleSnapshot}
                      </span>
                    )}
                    <p className="text-muted-foreground text-xs">
                      {it.skuSnapshot} · ×{it.quantity}
                    </p>
                  </div>
                  <span className="text-sm font-medium" dir="ltr">
                    {money(it.lineTotal)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Address */}
        <section className="rounded-lg border p-4 text-sm">
          <h3 className="mb-2 font-medium">{t("shipTo")}</h3>
          <p className="font-medium">{order.address.fullName}</p>
          <p className="text-muted-foreground">{order.address.phone}</p>
          <p className="text-muted-foreground">
            {order.address.line1}
            {order.address.line2 ? `, ${order.address.line2}` : ""},{" "}
            {order.address.city}, {order.address.governorate}
          </p>
        </section>

        {/* Payment + totals */}
        <section className="rounded-lg border p-4 text-sm">
          <h3 className="mb-2 font-medium">{t("payment")}</h3>
          <p className="text-muted-foreground mb-3">
            {t(`method_${order.paymentMethod}`)}
          </p>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("itemsTotal")}</span>
              <span dir="ltr">{money(order.itemsTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("shippingTotal")}
              </span>
              <span dir="ltr">{money(order.shippingTotal)}</span>
            </div>
            {Number(order.discountTotal) > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("discount")}</span>
                <span dir="ltr">-{money(order.discountTotal)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span>{t("total")}</span>
              <span dir="ltr">{money(order.grandTotal)}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
