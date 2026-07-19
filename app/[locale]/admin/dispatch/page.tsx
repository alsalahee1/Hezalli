import { getFormatter, getTranslations } from "next-intl/server";
import { MapPin, Package, Route } from "lucide-react";

import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Forbidden } from "@/components/auth/forbidden";
import { DispatchAssign } from "@/components/admin/dispatch-assign";

// Ops dispatch board: every in-flight Hezalli Express parcel and the courier
// it's assigned to. Unassigned parcels sort first so they get picked up.
export default async function DispatchPage() {
  const adminId = await requireAdminId();
  if (!adminId) return <Forbidden />;
  const t = await getTranslations("Dispatch");
  const tShip = await getTranslations("Orders");
  const format = await getFormatter();

  const [shipments, couriers] = await Promise.all([
    prisma.shipment.findMany({
      where: { platformManaged: true, subOrder: { status: "SHIPPED" } },
      orderBy: [{ driverId: "asc" }, { shippedAt: "asc" }],
      select: {
        id: true,
        status: true,
        trackingNumber: true,
        driverId: true,
        shippedAt: true,
        subOrder: {
          select: {
            order: {
              select: {
                id: true,
                address: { select: { city: true, governorate: true } },
              },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { roles: { has: "COURIER" }, isSuspended: false, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const courierOptions = couriers.map((c) => ({
    id: c.id,
    name: c.name ?? c.id.slice(-6),
  }));
  const unassigned = shipments.filter((s) => !s.driverId).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Route className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        {t("summary", { total: shipments.length, unassigned })}
      </p>

      {couriers.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-amber-600">
          {t("noCouriers")}
        </p>
      ) : null}

      {shipments.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {shipments.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="min-w-0 space-y-1 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <Package className="text-muted-foreground size-4" />#
                  {s.subOrder.order.id.slice(-8).toUpperCase()}
                  <span className="text-muted-foreground font-normal">
                    {tShip(`shipStatus_${s.status}`)}
                  </span>
                </p>
                <p className="text-muted-foreground flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {s.subOrder.order.address.city},{" "}
                  {s.subOrder.order.address.governorate}
                  {s.trackingNumber ? (
                    <span className="ms-2 font-mono" dir="ltr">
                      {s.trackingNumber}
                    </span>
                  ) : null}
                </p>
                {s.shippedAt ? (
                  <p className="text-muted-foreground text-xs">
                    {t("shipped")}:{" "}
                    {format.dateTime(s.shippedAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                ) : null}
              </div>
              <DispatchAssign
                shipmentId={s.id}
                driverId={s.driverId}
                couriers={courierOptions}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
