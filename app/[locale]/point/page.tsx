import { getFormatter, getTranslations } from "next-intl/server";
import {
  CalendarClock,
  Inbox,
  PackageCheck,
  RotateCcw,
  Truck,
} from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { maxDeliveryAttempts } from "@/lib/point-core";
import { prisma } from "@/lib/prisma";
import { RtsButton } from "@/components/point/rts-button";

// The point operator's dashboard: every routed parcel of an in-flight
// sub-order, grouped by where it is in the custody chain.
export default async function PointDashboardPage() {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  const t = await getTranslations("Point");
  const format = await getFormatter();

  const [parcels, maxAttempts] = await Promise.all([
    prisma.shipment.findMany({
      where: { deliveryPointId: gate.pointId, subOrder: { status: "SHIPPED" } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        trackingNumber: true,
        attemptCount: true,
        redeliverAt: true,
        redeliverNote: true,
        driver: { select: { name: true, email: true } },
        subOrder: {
          select: {
            store: { select: { name: true } },
            order: {
              select: {
                id: true,
                address: {
                  select: { fullName: true, city: true, governorate: true },
                },
              },
            },
          },
        },
      },
    }),
    maxDeliveryAttempts(),
  ]);

  const groups = [
    {
      key: "LABEL_CREATED",
      title: t("awaitingDrop"),
      icon: Inbox,
      items: parcels.filter((p) => p.status === "LABEL_CREATED"),
    },
    {
      key: "AT_POINT",
      title: t("atPoint"),
      icon: PackageCheck,
      items: parcels.filter((p) => p.status === "AT_POINT"),
    },
    {
      key: "OUT",
      title: t("outWithDrivers"),
      icon: Truck,
      items: parcels.filter(
        (p) => p.status === "OUT_FOR_DELIVERY" || p.status === "FAILED",
      ),
    },
    {
      key: "RETURNED_TO_POINT",
      title: t("returnedToPoint"),
      icon: RotateCcw,
      items: parcels.filter((p) => p.status === "RETURNED_TO_POINT"),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">{t("parcelsTitle")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("parcelsCount", { count: parcels.length })}
        </p>
      </div>

      {parcels.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
          <PackageCheck className="mx-auto mb-2 size-8 opacity-50" />
          {t("noParcels")}
        </div>
      ) : (
        groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.key} className="space-y-2">
              <h2 className="text-muted-foreground flex items-center gap-1.5 text-sm font-semibold">
                <g.icon className="size-4" /> {g.title}
                <span className="bg-muted rounded px-1.5 text-xs">
                  {g.items.length}
                </span>
              </h2>
              <ul className="space-y-2">
                {g.items.map((p) => (
                  <li key={p.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium" dir="ltr">
                        {p.trackingNumber}
                      </span>
                      {p.status === "FAILED" ? (
                        <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-600">
                          {t("failedBadge")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-sm">
                      {p.subOrder.store.name} →{" "}
                      {p.subOrder.order.address.fullName} ·{" "}
                      {p.subOrder.order.address.city}
                    </p>
                    {p.driver ? (
                      <p className="text-muted-foreground text-xs">
                        {t("driver")}: {p.driver.name ?? p.driver.email}
                      </p>
                    ) : null}
                    {p.attemptCount > 0 ? (
                      <p className="text-muted-foreground text-xs">
                        {t("attempts", {
                          count: p.attemptCount,
                          max: maxAttempts,
                        })}
                      </p>
                    ) : null}
                    {p.redeliverAt ? (
                      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-500">
                        <CalendarClock className="size-3.5" />
                        {t("redeliverOn", {
                          date: format.dateTime(p.redeliverAt, {
                            dateStyle: "medium",
                          }),
                        })}
                        {p.redeliverNote ? ` — ${p.redeliverNote}` : null}
                      </p>
                    ) : null}
                    {/* Attempt limit reached → offer the terminal RTS scan-less action. */}
                    {p.status === "RETURNED_TO_POINT" &&
                    p.attemptCount >= maxAttempts &&
                    p.trackingNumber ? (
                      <div className="mt-2">
                        <RtsButton tracking={p.trackingNumber} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
