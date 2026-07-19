import { getFormatter, getTranslations } from "next-intl/server";
import { AlertTriangle, Clock, MapPin, Package, Route } from "lucide-react";

import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";
import { dueBy as computeDueBy, slaState, slaWeight } from "@/lib/sla";
import { cn } from "@/lib/utils";
import { Forbidden } from "@/components/auth/forbidden";
import { DispatchAssign } from "@/components/admin/dispatch-assign";

// Ops dispatch board: every in-flight Hezalli Express parcel, its assigned
// courier, and its delivery-SLA state. Overdue parcels sort first so ops chase
// them before the promise is missed.
export default async function DispatchPage() {
  const adminId = await requireAdminId();
  if (!adminId) return <Forbidden />;
  const t = await getTranslations("Dispatch");
  const tShip = await getTranslations("Orders");
  const format = await getFormatter();

  const [shipments, couriers, settings] = await Promise.all([
    prisma.shipment.findMany({
      where: { platformManaged: true, subOrder: { status: "SHIPPED" } },
      select: {
        id: true,
        status: true,
        trackingNumber: true,
        driverId: true,
        shippedAt: true,
        subOrder: {
          select: {
            shippingMethod: true,
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
    getPlatformSettings(),
  ]);

  const courierOptions = couriers.map((c) => ({
    id: c.id,
    name: c.name ?? c.id.slice(-6),
  }));

  const now = new Date();
  // Attach each parcel's SLA state from its own tier's max ETA.
  const rows = shipments.map((s) => {
    const etaMax =
      s.subOrder.shippingMethod === "EXPRESS"
        ? settings.express_eta_max_days
        : settings.std_eta_max_days;
    const due = s.shippedAt ? computeDueBy(s.shippedAt, etaMax) : null;
    const sla = due ? slaState(due, now) : "on_track";
    return { ...s, due, sla };
  });
  // Overdue first, then due-soon; unassigned before assigned; oldest first.
  rows.sort(
    (a, b) =>
      slaWeight(a.sla) - slaWeight(b.sla) ||
      Number(!!a.driverId) - Number(!!b.driverId) ||
      (a.shippedAt?.getTime() ?? 0) - (b.shippedAt?.getTime() ?? 0),
  );

  const unassigned = rows.filter((s) => !s.driverId).length;
  const overdue = rows.filter((s) => s.sla === "overdue").length;
  const dueSoon = rows.filter((s) => s.sla === "due_soon").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Route className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          {t("summary", { total: rows.length, unassigned })}
        </span>
        {overdue > 0 ? (
          <span className="inline-flex items-center gap-1 font-medium text-red-600">
            <AlertTriangle className="size-3.5" />
            {t("overdueCount", { count: overdue })}
          </span>
        ) : null}
        {dueSoon > 0 ? (
          <span className="inline-flex items-center gap-1 font-medium text-amber-600">
            <Clock className="size-3.5" />
            {t("dueSoonCount", { count: dueSoon })}
          </span>
        ) : null}
      </div>

      {couriers.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-amber-600">
          {t("noCouriers")}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => (
            <div
              key={s.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4",
                s.sla === "overdue"
                  ? "border-red-500/40 bg-red-500/5"
                  : s.sla === "due_soon"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : null,
              )}
            >
              <div className="min-w-0 space-y-1 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <Package className="text-muted-foreground size-4" />#
                  {s.subOrder.order.id.slice(-8).toUpperCase()}
                  <span className="text-muted-foreground font-normal">
                    {tShip(`shipStatus_${s.status}`)}
                  </span>
                  {s.sla === "overdue" ? (
                    <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-600">
                      <AlertTriangle className="size-3" /> {t("overdue")}
                    </span>
                  ) : s.sla === "due_soon" ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-600">
                      <Clock className="size-3" /> {t("dueSoon")}
                    </span>
                  ) : null}
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
                {s.due ? (
                  <p
                    className={cn(
                      "text-xs",
                      s.sla === "overdue"
                        ? "font-medium text-red-600"
                        : "text-muted-foreground",
                    )}
                  >
                    {t("dueByLabel")}:{" "}
                    {format.dateTime(s.due, {
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
