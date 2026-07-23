import { getFormatter, getTranslations } from "next-intl/server";
import { MapPin, PackageCheck } from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ParcelSearch } from "@/components/point/parcel-search";

// Parcels that finished their journey through this hub. The dashboard only
// lists in-flight parcels (subOrder SHIPPED); once delivered or returned they
// drop off that list, so this is the only place the operator can look back —
// which matters, because the scan trail is the custody evidence when a parcel
// is disputed (docs/DELIVERY-POINTS.md §4).
const PAGE_SIZE = 50;

export default async function PointHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const t = await getTranslations("Point");
  const tShip = await getTranslations("Orders");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  // Fetch one row past the page so "next" only shows when it has content.
  const rows = await prisma.shipment.findMany({
    where: {
      OR: [{ deliveryPointId: gate.pointId }, { originPointId: gate.pointId }],
      status: { in: ["DELIVERED", "RETURNED"] },
    },
    orderBy: { updatedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      status: true,
      trackingNumber: true,
      deliveredAt: true,
      updatedAt: true,
      subOrder: {
        select: {
          shippingMethod: true,
          store: { select: { name: true } },
          order: {
            select: {
              address: { select: { fullName: true, city: true } },
            },
          },
        },
      },
    },
  });
  const hasMore = rows.length > PAGE_SIZE;
  const shipments = rows.slice(0, PAGE_SIZE);

  // The fee each parcel booked on THIS hub's ledger (handling or transfer
  // leg — both land as HANDLING_FEE rows keyed by shipment).
  const feeRows = shipments.length
    ? await prisma.deliveryPointLedgerEntry.groupBy({
        by: ["shipmentId"],
        where: {
          pointId: gate.pointId,
          shipmentId: { in: shipments.map((s) => s.id) },
          type: "HANDLING_FEE",
        },
        _sum: { amountUsd: true },
      })
    : [];
  const feeBy = new Map(
    feeRows.map((r) => [r.shipmentId, Number(r._sum.amountUsd ?? 0)]),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{t("historyTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("historySubtitle")}</p>
      </div>

      <ParcelSearch />

      {shipments.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
          <PackageCheck className="mx-auto mb-2 size-8 opacity-50" />
          {page > 1 ? t("noMoreEntries") : t("noHistory")}
        </div>
      ) : (
        <ul className="space-y-3">
          {shipments.map((s) => {
            const fee = feeBy.get(s.id) ?? 0;
            return (
              <li key={s.id}>
                <Link
                  href={`/point/parcel/${s.id}`}
                  className="hover:border-primary/50 block rounded-xl border p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium" dir="ltr">
                      {s.trackingNumber}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                        s.status === "DELIVERED"
                          ? "bg-emerald-500/15 text-emerald-600"
                          : "bg-red-500/15 text-red-600",
                      )}
                    >
                      {tShip(`shipStatus_${s.status}`)}
                    </span>
                    {s.subOrder.shippingMethod === "PICKUP" ? (
                      <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-sky-600">
                        {t("pickupBadge")}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-sm">
                    {s.subOrder.store.name} →{" "}
                    {s.subOrder.order.address.fullName}
                  </p>
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    <MapPin className="size-3" />
                    {s.subOrder.order.address.city}
                    <span>·</span>
                    <span dir="ltr">
                      {format.dateTime(s.deliveredAt ?? s.updatedAt, {
                        dateStyle: "medium",
                      })}
                    </span>
                  </p>
                  {fee > 0 ? (
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-500">
                      {t("historyFee")}:{" "}
                      <span className="font-semibold" dir="ltr">
                        {money(fee)}
                      </span>
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {page > 1 || hasMore ? (
        <div className="flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={`/point/history?page=${page - 1}`}
              className="text-primary text-sm font-medium hover:underline"
            >
              {t("prevPage")}
            </Link>
          ) : (
            <span />
          )}
          {hasMore ? (
            <Link
              href={`/point/history?page=${page + 1}`}
              className="text-primary text-sm font-medium hover:underline"
            >
              {t("nextPage")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
