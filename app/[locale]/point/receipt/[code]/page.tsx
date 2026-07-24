import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2, Store } from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { PrintButton } from "@/components/point/print-button";

// A printable pickup receipt (docs §42i) the counter can hand the buyer after
// a collection: hub details, what was collected, and the cash taken (or
// "prepaid"). Resolved by the buyer's delivery code among parcels this hub has
// already delivered — so it only exists after a real pickup here.
export default async function PointReceiptPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  const { code } = await params;
  const t = await getTranslations("Point");
  const format = await getFormatter();
  const locale = await getLocale();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });
  const q = decodeURIComponent(code).trim().toUpperCase();

  const shipment = q
    ? await prisma.shipment.findFirst({
        where: {
          deliveryCode: q,
          deliveryPointId: gate.pointId,
          status: "DELIVERED",
        },
        orderBy: { deliveredAt: "desc" },
        select: {
          trackingNumber: true,
          deliveredAt: true,
          deliveryPoint: {
            select: {
              name: true,
              phone: true,
              addressLine: true,
              city: true,
              governorate: true,
            },
          },
          subOrder: {
            select: {
              id: true,
              store: { select: { name: true } },
              order: { select: { paymentMethod: true } },
            },
          },
        },
      })
    : null;

  if (!shipment?.subOrder) {
    return (
      <div className="space-y-3 py-10 text-center">
        <p className="text-muted-foreground text-sm">{t("receiptNotFound")}</p>
        <Link href="/point/scan" className="text-primary text-sm underline">
          {t("receiptBack")}
        </Link>
      </div>
    );
  }

  // Cash actually taken at this counter for this parcel (the COD_COLLECTED
  // ledger row). Zero for prepaid or a COD settled digitally beforehand.
  const codAgg = await prisma.deliveryPointLedgerEntry.aggregate({
    where: {
      pointId: gate.pointId,
      subOrderId: shipment.subOrder.id,
      type: "COD_COLLECTED",
    },
    _sum: { amountUsd: true },
  });
  const collected = Number(codAgg._sum.amountUsd ?? 0);
  const point = shipment.deliveryPoint;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/point/scan" className="text-muted-foreground text-sm">
          {t("receiptBack")}
        </Link>
        <PrintButton />
      </div>

      {/* The receipt card — the only thing that prints. */}
      <div className="space-y-4 rounded-xl border p-5">
        <div className="space-y-1 border-b pb-3 text-center">
          <p className="flex items-center justify-center gap-1.5 text-base font-semibold">
            <Store className="size-4" /> {point?.name}
          </p>
          {point?.phone ? (
            <p className="text-muted-foreground text-xs" dir="ltr">
              {point.phone}
            </p>
          ) : null}
          {point ? (
            <p className="text-muted-foreground text-xs">
              {point.addressLine}, {point.city}, {point.governorate}
            </p>
          ) : null}
        </div>

        <p className="text-center text-sm font-semibold">{t("receiptTitle")}</p>

        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("receiptStore")}</dt>
            <dd className="font-medium">{shipment.subOrder.store.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("receiptTracking")}</dt>
            <dd className="font-medium" dir="ltr">
              {shipment.trackingNumber}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("receiptDate")}</dt>
            <dd className="font-medium">
              {shipment.deliveredAt
                ? format.dateTime(shipment.deliveredAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—"}
            </dd>
          </div>
        </dl>

        {/* The money line: what the counter took, or a prepaid note. */}
        <div className="rounded-lg border p-3 text-center">
          {collected > 0 ? (
            <>
              <p className="text-muted-foreground text-xs">
                {t("receiptCodCollected")}
              </p>
              <p className="mt-0.5 text-2xl font-bold" dir="ltr">
                {money(collected)}
              </p>
            </>
          ) : (
            <p className="text-sm font-medium">{t("receiptPrepaid")}</p>
          )}
        </div>

        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" /> {t("receiptDelivered")}
        </p>

        <p className="text-muted-foreground text-center text-[10px]">
          {t("receiptFooter", {
            locale: locale === "ar" ? "حزالي" : "Hezalli",
          })}
        </p>
      </div>
    </div>
  );
}
