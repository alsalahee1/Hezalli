import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { CheckCircle2, MapPin, Phone, Store } from "lucide-react";

import { requireCourierId } from "@/lib/authz";
import { codSettledDigitally } from "@/lib/payment-state";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { Link } from "@/i18n/navigation";
import { JobActions } from "@/components/driver/job-actions";
import { DeliveryWindowBadge } from "@/components/orders/delivery-window-badge";

export default async function DriverJobPage({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  const { shipmentId } = await params;
  const courierId = await requireCourierId();
  if (!courierId) return null;
  const t = await getTranslations("Driver");
  const tShip = await getTranslations("Orders");
  const format = await getFormatter();

  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, driverId: courierId },
    select: {
      id: true,
      status: true,
      trackingNumber: true,
      redeliverAt: true,
      redeliverNote: true,
      deliveryPoint: {
        select: { name: true, addressLine: true, city: true, phone: true },
      },
      events: {
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, createdAt: true },
      },
      attempts: {
        where: { outcome: "DELIVERED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { recipientName: true, proofPhotoKey: true },
      },
      subOrder: {
        select: {
          status: true,
          itemsTotal: true,
          shippingTotal: true,
          discountTotal: true,
          store: { select: { name: true } },
          items: { select: { id: true, titleSnapshot: true, quantity: true } },
          order: {
            select: {
              id: true,
              paymentMethod: true,
              grandTotal: true,
              deliveryDate: true,
              deliverySlot: true,
              address: true,
              payment: { select: { status: true, confirmedBy: true } },
            },
          },
        },
      },
    },
  });
  if (!shipment || !shipment.subOrder) notFound();

  const sub = shipment.subOrder;
  const a = sub.order.address;
  const done = sub.status !== "SHIPPED";
  // A COD order the buyer already paid from their wallet (docs §39) is
  // handled like prepaid: hand over the parcel, collect NOTHING. A payment
  // confirmed by a sibling sub-order's cash capture does not count as paid.
  const codPaid = codSettledDigitally(sub.order);
  const isCod = sub.order.paymentMethod === "COD" && !codPaid;
  const proof = shipment.attempts[0] ?? null;
  // A point-routed parcel the hub still holds: the driver collects it with a
  // scan at the counter — no phone-side actions until then.
  const heldAtPoint =
    Boolean(shipment.deliveryPoint) &&
    ["LABEL_CREATED", "AT_POINT", "RETURNED_TO_POINT"].includes(
      shipment.status,
    );

  return (
    <div className="space-y-5">
      <Link
        href="/driver"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t("back")}
      </Link>

      <div>
        <h1 className="text-lg font-semibold">
          #{sub.order.id.slice(-8).toUpperCase()}
        </h1>
        <p className="text-muted-foreground text-sm">
          {tShip(`shipStatus_${shipment.status}`)}
        </p>
      </div>

      {/* Pickup point + buyer's requested redelivery day, when applicable. */}
      {shipment.deliveryPoint ? (
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-medium">
            {heldAtPoint ? t("collectFromPoint") : t("pickupPoint")}:{" "}
            {shipment.deliveryPoint.name}
          </p>
          <p className="text-muted-foreground text-xs">
            {shipment.deliveryPoint.addressLine}, {shipment.deliveryPoint.city}
            {" · "}
            <a
              href={`tel:${shipment.deliveryPoint.phone}`}
              className="text-primary"
              dir="ltr"
            >
              {shipment.deliveryPoint.phone}
            </a>
          </p>
        </div>
      ) : null}
      {shipment.redeliverAt && !done ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-500">
            {t("redeliverOn", {
              date: format.dateTime(shipment.redeliverAt, {
                dateStyle: "medium",
              }),
            })}
          </p>
          {shipment.redeliverNote ? (
            <p className="text-muted-foreground text-xs">
              {shipment.redeliverNote}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* COD collection callout — the driver collects THIS sub-order's cash
          (a multi-seller order's other parcels collect their own shares). */}
      {isCod ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium text-amber-700 dark:text-amber-500">
            {t("collectCod", {
              amount: format.number(
                Number(sub.itemsTotal) +
                  Number(sub.shippingTotal) -
                  Number(sub.discountTotal),
                { style: "currency", currency: "USD" },
              ),
            })}
          </p>
        </div>
      ) : sub.order.paymentMethod === "COD" && codPaid ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          <p className="font-medium text-emerald-700 dark:text-emerald-500">
            {t("codPaidDigitally")}
          </p>
        </div>
      ) : null}

      {/* Delivery target */}
      <div className="space-y-2 rounded-xl border p-4 text-sm">
        <p className="text-base font-semibold">{a.fullName}</p>
        <a
          href={`tel:${a.phone}`}
          className="text-primary inline-flex items-center gap-1.5 font-medium"
        >
          <Phone className="size-4" /> {a.phone}
        </a>
        <p className="flex items-start gap-1.5">
          <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <span>
            {a.line1}
            {a.line2 ? `, ${a.line2}` : ""}
            <br />
            {a.city}, {a.governorate}
            {a.notes ? (
              <>
                <br />
                <span className="text-muted-foreground">{a.notes}</span>
              </>
            ) : null}
          </span>
        </p>
        <p className="text-muted-foreground flex items-center gap-1.5 pt-1 text-xs">
          <Store className="size-3.5" /> {sub.store.name}
        </p>
        {sub.order.deliveryDate && sub.order.deliverySlot ? (
          <div className="pt-1">
            <DeliveryWindowBadge
              date={sub.order.deliveryDate}
              slot={sub.order.deliverySlot}
            />
          </div>
        ) : null}
      </div>

      {/* Items */}
      <div className="rounded-xl border p-4 text-sm">
        <p className="mb-2 font-medium">{t("parcel")}</p>
        <ul className="space-y-1">
          {sub.items.map((it) => (
            <li
              key={it.id}
              className="text-muted-foreground flex justify-between"
            >
              <span className="truncate">{it.titleSnapshot}</span>
              <span>×{it.quantity}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      {done ? (
        <div className="space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-500">
            <CheckCircle2 className="size-5" /> {t("jobDone")}
          </div>
          {proof ? (
            <div className="space-y-2 border-t border-emerald-500/30 pt-3 text-sm">
              {proof.recipientName ? (
                <p>
                  <span className="text-muted-foreground">
                    {t("proofRecipient")}:{" "}
                  </span>
                  <span className="font-medium">{proof.recipientName}</span>
                </p>
              ) : null}
              {proof.proofPhotoKey ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={storage.publicUrl(proof.proofPhotoKey)}
                  alt={t("proofPhotoAlt")}
                  className="max-h-56 w-full rounded-lg object-cover"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : heldAtPoint ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-4 text-center text-sm">
          {t("heldAtPointHint")}
        </div>
      ) : (
        <JobActions shipmentId={shipment.id} status={shipment.status} />
      )}

      {/* History */}
      {shipment.events.length > 0 ? (
        <div className="text-sm">
          <p className="mb-2 font-medium">{t("history")}</p>
          <ol className="space-y-2">
            {shipment.events.map((ev) => (
              <li key={ev.id} className="flex justify-between">
                <span>{tShip(`shipStatus_${ev.status}`)}</span>
                <span className="text-muted-foreground text-xs">
                  {format.dateTime(ev.createdAt, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
