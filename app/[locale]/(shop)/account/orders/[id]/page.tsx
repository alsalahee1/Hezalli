import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, ExternalLink, Printer, Truck } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_BADGE, canBuyerCancel } from "@/lib/order-status";
import { buildTrackingUrl } from "@/lib/tracking";
import { getPlatformSettings } from "@/lib/settings";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CancelOrderButton } from "@/components/orders/cancel-order-button";
import { ConfirmReceivedButton } from "@/components/orders/confirm-received-button";
import { PaymentProofForm } from "@/components/orders/payment-proof-form";
import { QrCode } from "@/components/orders/qr-code";
import { RedeliveryForm } from "@/components/orders/redelivery-form";
import { ChatLauncher } from "@/components/chat/chat-launcher";
import {
  ReturnBlock,
  type ReturnView,
} from "@/components/returns/return-block";
import type { ReturnType } from "@/lib/returns";

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
        include: {
          store: { select: { name: true, slug: true } },
          items: true,
          shipment: {
            include: {
              carrier: true,
              events: { orderBy: { createdAt: "asc" } },
            },
          },
          return: { include: { dispute: { select: { id: true } } } },
        },
      },
    },
  });
  if (!order) notFound();

  const settings = await getPlatformSettings();
  const returnWindowDays = settings.return_window_days;
  const returnWindowMs =
    (Number.isFinite(returnWindowDays) ? returnWindowDays : 7) * 86_400_000;
  // Delivery-time estimate ranges (days) per tier, for shipped-not-yet-delivered
  // sub-orders. Falls back to standard if a method is somehow unset.
  const etaDaysByMethod: Record<string, [number, number]> = {
    STANDARD: [settings.std_eta_min_days, settings.std_eta_max_days],
    EXPRESS: [settings.express_eta_min_days, settings.express_eta_max_days],
  };

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
        {order.subOrders.some(
          (s) => s.status === "SHIPPED" || s.status === "DELIVERED",
        ) ? (
          <ConfirmReceivedButton orderId={order.id} />
        ) : (
          futureBtn(t("confirmReceived"), t("confirmHint"))
        )}
        {futureBtn(t("review"), t("reviewHint"))}
        {order.subOrders.some(
          (s) => s.status === "SHIPPED" || s.status === "DELIVERED",
        )
          ? futureBtn(t("notReceived"), t("notReceivedHint"))
          : null}
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
          method={
            order.paymentMethod as "BANK_TRANSFER" | "USDT" | "LOCAL_WALLET"
          }
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
      {order.subOrders.map((s) => {
        const trackUrl = buildTrackingUrl(
          s.shipment?.carrier?.trackingUrl,
          s.shipment?.trackingNumber,
        );
        // Estimated delivery window for a shipped-but-not-delivered order:
        // shippedAt + the tier's ETA range.
        const shippedAt = s.shipment?.shippedAt ?? null;
        const [etaMin, etaMax] =
          etaDaysByMethod[s.shippingMethod] ?? etaDaysByMethod.STANDARD;
        const deliveryEstimate =
          s.status === "SHIPPED" && shippedAt
            ? {
                from: new Date(shippedAt.getTime() + etaMin * 86_400_000),
                to: new Date(shippedAt.getTime() + etaMax * 86_400_000),
              }
            : null;
        const ev = (s.return?.evidence ?? {}) as {
          type?: ReturnType;
          description?: string;
          returnAddress?: string | null;
          returnTracking?: string | null;
        };
        const retView: ReturnView = s.return
          ? {
              id: s.return.id,
              status: s.return.status,
              reason: s.return.reason,
              resolution: s.return.resolution,
              type:
                ev.type === "refund_only" ? "refund_only" : "return_and_refund",
              description: ev.description ?? "",
              returnAddress: ev.returnAddress ?? null,
              returnTracking: ev.returnTracking ?? null,
              hasDispute: Boolean(s.return.dispute),
            }
          : null;
        const returnBase = s.completedAt ?? s.shipment?.deliveredAt ?? null;
        const canRequestReturn =
          !s.return &&
          (s.status === "DELIVERED" || s.status === "COMPLETED") &&
          (!returnBase ||
            Date.now() - new Date(returnBase).getTime() <= returnWindowMs);
        return (
          <section key={s.id} className="rounded-lg border">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-sm">
              <span className="flex items-center gap-2 font-medium">
                {s.store.name}
                {s.shippingMethod === "EXPRESS" ? (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600">
                    {t("expressBadge")}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                <ChatLauncher
                  storeId={s.storeId}
                  subOrderId={s.id}
                  label={t("contactSeller")}
                />
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-medium",
                    STATUS_BADGE[s.status] ?? "bg-muted",
                  )}
                >
                  {t(`status_${s.status}`)}
                </span>
              </span>
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

            {s.shipment ? (
              <div className="space-y-3 border-t p-4 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Truck className="size-4" /> {t("trackingTitle")}
                </div>
                <div className="space-y-1">
                  <p>
                    <span className="text-muted-foreground">
                      {t("carrier")}:{" "}
                    </span>
                    {s.shipment.carrier?.name ?? "—"}
                  </p>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">
                      {t("trackingNumber")}:{" "}
                    </span>
                    <span dir="ltr">{s.shipment.trackingNumber ?? "—"}</span>
                    {trackUrl ? (
                      <a
                        href={trackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-1 hover:underline"
                      >
                        {t("trackPackage")}
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </p>
                  {deliveryEstimate ? (
                    <p>
                      <span className="text-muted-foreground">
                        {t("estimatedDelivery")}:{" "}
                      </span>
                      <span className="font-medium">
                        {etaMin === etaMax
                          ? format.dateTime(deliveryEstimate.to, {
                              dateStyle: "medium",
                            })
                          : `${format.dateTime(deliveryEstimate.from, {
                              dateStyle: "medium",
                            })} – ${format.dateTime(deliveryEstimate.to, {
                              dateStyle: "medium",
                            })}`}
                      </span>
                    </p>
                  ) : null}
                </div>
                {/* Delivery QR: the courier can scan (or type) this code at the
                    doorstep as verified proof of delivery. Optional — delivery
                    also works without it. */}
                {s.shipment.deliveryCode && s.status === "SHIPPED" ? (
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <QrCode
                      value={s.shipment.deliveryCode}
                      size={84}
                      className="shrink-0"
                    />
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{t("deliveryQrTitle")}</p>
                      <p className="text-muted-foreground text-xs">
                        {t("deliveryQrHint")}
                      </p>
                      <p className="mt-1 font-mono text-base tracking-widest" dir="ltr">
                        {s.shipment.deliveryCode}
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* Failed attempt → let the buyer pick a new delivery day. */}
                {s.status === "SHIPPED" &&
                (s.shipment.status === "FAILED" ||
                  s.shipment.status === "RETURNED_TO_POINT") ? (
                  <RedeliveryForm
                    subOrderId={s.id}
                    currentDate={
                      s.shipment.redeliverAt
                        ? s.shipment.redeliverAt.toISOString().slice(0, 10)
                        : null
                    }
                  />
                ) : null}

                {s.shipment.events.length > 0 ? (
                  <ol className="space-y-2 border-t pt-3">
                    {s.shipment.events.map((ev) => (
                      <li key={ev.id} className="flex gap-3">
                        <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" />
                        <span>
                          <span className="font-medium">
                            {t(`shipStatus_${ev.status}`)}
                          </span>
                          {ev.note ? (
                            <span className="text-muted-foreground">
                              {" "}
                              — {ev.note}
                            </span>
                          ) : null}
                          <br />
                          <span className="text-muted-foreground text-xs">
                            {format.dateTime(ev.createdAt, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            ) : null}

            <ReturnBlock
              subOrderId={s.id}
              canRequest={canRequestReturn}
              ret={retView}
            />
          </section>
        );
      })}

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
