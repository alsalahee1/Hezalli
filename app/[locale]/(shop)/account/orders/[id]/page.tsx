import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, ExternalLink, Printer, Truck } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_BADGE, canBuyerCancel } from "@/lib/order-status";
import { codSettledDigitally } from "@/lib/payment-state";
import { buildTrackingUrl } from "@/lib/tracking";
import { getPlatformSettings } from "@/lib/settings";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CancelOrderButton } from "@/components/orders/cancel-order-button";
import { ConfirmReceivedButton } from "@/components/orders/confirm-received-button";
import { PayCodButton } from "@/components/orders/pay-cod-button";
import { PaymentProofForm } from "@/components/orders/payment-proof-form";
import { QrCode } from "@/components/orders/qr-code";
import { RedeliveryForm } from "@/components/orders/redelivery-form";
import { DeliveryRating } from "@/components/orders/delivery-rating";
import { DeliveryWindowBadge } from "@/components/orders/delivery-window-badge";
import { ChatLauncher } from "@/components/chat/chat-launcher";
import { ReviewForm } from "@/components/product/review-form";
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
              deliveryPoint: {
                select: {
                  name: true,
                  addressLine: true,
                  city: true,
                  governorate: true,
                  phone: true,
                },
              },
              events: { orderBy: { createdAt: "asc" } },
              deliveryRating: { select: { stars: true, comment: true } },
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
              id: true,
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
      {
        url: v.product.images[0]?.url ?? null,
        slug: v.product.slug,
        productId: v.product.id,
      },
    ]),
  );

  // Post-purchase reviews: each product in a COMPLETED sub-order can be rated
  // right here (the same ReviewForm the product page uses; one review per
  // product per sub-order, editable within the edit window).
  const completedSubs = order.subOrders.filter((s) => s.status === "COMPLETED");
  const myReviews = completedSubs.length
    ? await prisma.review.findMany({
        where: {
          buyerId: session.user.id,
          subOrderId: { in: completedSubs.map((s) => s.id) },
        },
        select: {
          id: true,
          productId: true,
          subOrderId: true,
          rating: true,
          comment: true,
          images: { select: { url: true } },
        },
      })
    : [];
  const reviewByKey = new Map(
    myReviews.map((r) => [`${r.subOrderId}:${r.productId}`, r]),
  );

  const money = (n: unknown) =>
    format.number(Number(n), { style: "currency", currency: "USD" });

  // Doorstep digital payment (docs §39): a COD order is wallet-payable while
  // no sub-order has gone past SHIPPED (no cash exchanged, nothing cancelled)
  // and the payment is still unconfirmed. Balance shown net of any COD hold.
  const codPayable =
    settings.cod_wallet_pay_enabled &&
    order.paymentMethod === "COD" &&
    order.payment?.status !== "CONFIRMED" &&
    order.subOrders.length > 0 &&
    order.subOrders.every((s) =>
      ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED"].includes(s.status),
    );
  let walletBalance = 0;
  if (codPayable) {
    const w = await prisma.wallet.findUnique({
      where: { userId: session.user.id },
      select: { availableUsd: true, codHoldUsd: true },
    });
    walletBalance = Math.max(
      0,
      Number(w?.availableUsd ?? 0) - Number(w?.codHoldUsd ?? 0),
    );
  }

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

      {/* Scheduled Express delivery window the buyer requested at checkout. */}
      {order.deliveryDate && order.deliverySlot ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("scheduledFor")}</span>
          <DeliveryWindowBadge
            date={order.deliveryDate}
            slot={order.deliverySlot}
          />
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {canBuyerCancel(order.status) ? (
          <CancelOrderButton orderId={order.id} />
        ) : null}
        {/* "Confirm received" only when something is actually confirmable: an
            already-DELIVERED parcel, or a still-SHIPPED THIRD-PARTY one (there
            the buyer's confirmation is the delivery signal). For Hezalli Express
            and PICKUP the driver's QR scan / point counter records delivery, so
            the buyer confirms only once it reads DELIVERED — showing the button
            earlier would just surface a refusal. */}
        {order.subOrders.some(
          (s) =>
            s.status === "DELIVERED" ||
            (s.status === "SHIPPED" &&
              !s.shipment?.platformManaged &&
              s.shippingMethod !== "PICKUP"),
        ) ? (
          <ConfirmReceivedButton orderId={order.id} />
        ) : (
          futureBtn(t("confirmReceived"), t("confirmHint"))
        )}
        {completedSubs.length > 0 ? (
          <Button asChild size="sm" variant="outline">
            <a href="#rate-products">{t("review")}</a>
          </Button>
        ) : (
          futureBtn(t("review"), t("reviewHint"))
        )}
        {/* "Not received": jump to the affected shipment's card, where the
            refund request (delivered) or seller chat (still shipping) lives. */}
        {(() => {
          const claimable = order.subOrders.find(
            (s) => s.status === "SHIPPED" || s.status === "DELIVERED",
          );
          return claimable ? (
            <Button asChild size="sm" variant="outline">
              <a href={`#sub-${claimable.id}`}>{t("notReceived")}</a>
            </Button>
          ) : null;
        })()}
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

      {/* Doorstep digital payment (docs §39): settle COD from the wallet so
          no cash is needed at delivery. Only while fully payable. */}
      {codPayable ? (
        <PayCodButton
          orderId={order.id}
          amount={money(Number(order.grandTotal))}
          balance={money(walletBalance)}
          canCover={walletBalance >= Number(order.grandTotal)}
        />
      ) : null}
      {codSettledDigitally(order) &&
      !["COMPLETED", "CANCELLED", "REFUNDED"].includes(order.status) ? (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-500">
          {t("payCodDone")}
        </p>
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
          <section key={s.id} id={`sub-${s.id}`} className="rounded-lg border">
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
                {/* Pickup orders: where to collect, once the parcel is there. */}
                {s.shippingMethod === "PICKUP" && s.shipment.deliveryPoint ? (
                  <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-3 text-sm">
                    <p className="font-medium">
                      {s.shipment.status === "AT_POINT"
                        ? t("pickupReadyTitle")
                        : t("pickupPendingTitle")}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {s.shipment.deliveryPoint.name} —{" "}
                      {s.shipment.deliveryPoint.addressLine},{" "}
                      {s.shipment.deliveryPoint.city},{" "}
                      {s.shipment.deliveryPoint.governorate} ·{" "}
                      <span dir="ltr">{s.shipment.deliveryPoint.phone}</span>
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t("pickupBringCode")}
                    </p>
                  </div>
                ) : null}

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
                      <p
                        className="mt-1 font-mono text-base tracking-widest"
                        dir="ltr"
                      >
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

                {/* Rate the courier once an Express parcel is delivered. */}
                {s.shippingMethod === "EXPRESS" &&
                s.shipment.driverId &&
                (s.status === "DELIVERED" || s.status === "COMPLETED") ? (
                  <DeliveryRating
                    shipmentId={s.shipment.id}
                    existing={s.shipment.deliveryRating}
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

      {/* Rate purchased products (completed sub-orders only) */}
      {completedSubs.length > 0 ? (
        <section id="rate-products" className="rounded-lg border p-4">
          <h3 className="mb-3 font-medium">{t("review")}</h3>
          <div className="space-y-4">
            {completedSubs.flatMap((s) => {
              const seen = new Set<string>();
              return s.items.map((it) => {
                const meta = metaByVariant.get(it.variantId);
                const productId = meta?.productId;
                if (!productId) return null;
                const key = `${s.id}:${productId}`;
                if (seen.has(key)) return null;
                seen.add(key);
                const existing = reviewByKey.get(key);
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {meta?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={meta.url}
                          alt=""
                          className="size-12 shrink-0 rounded border object-cover"
                        />
                      ) : null}
                      <p className="truncate text-sm font-medium">
                        {it.titleSnapshot}
                      </p>
                    </div>
                    <div className="min-w-0 grow sm:grow-0">
                      <ReviewForm
                        productId={productId}
                        subOrderId={s.id}
                        existing={
                          existing
                            ? {
                                reviewId: existing.id,
                                rating: existing.rating,
                                comment: existing.comment ?? "",
                                images: existing.images.map((i) => i.url),
                              }
                            : undefined
                        }
                      />
                    </div>
                  </div>
                );
              });
            })}
          </div>
        </section>
      ) : null}

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
