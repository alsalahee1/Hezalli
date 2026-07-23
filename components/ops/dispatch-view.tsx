import { getFormatter, getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  BarChart3,
  Clock,
  MapPin,
  Package,
  RotateCcw,
  Route,
  Weight,
} from "lucide-react";

import { requireDeliveryManagerId } from "@/lib/authz";
import { subOrderMetrics } from "@/lib/courier-capacity";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";
import { dueBy as computeDueBy, slaState, slaWeight } from "@/lib/sla";
import { cn } from "@/lib/utils";
import { Forbidden } from "@/components/auth/forbidden";
import { DispatchAssign } from "@/components/admin/dispatch-assign";
import { DispatchBulkAssign } from "@/components/admin/dispatch-bulk-assign";
import { DeliveryWindowBadge } from "@/components/orders/delivery-window-badge";

// Ops dispatch board: every in-flight Hezalli Express parcel, its assigned
// courier, and its delivery-SLA state. Overdue parcels sort first so ops chase
// them before the promise is missed.
export async function DispatchView({ base }: { base: string }) {
  const adminId = await requireDeliveryManagerId();
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
        attemptCount: true,
        subOrder: {
          select: {
            id: true,
            shippingMethod: true,
            order: {
              select: {
                id: true,
                deliveryDate: true,
                deliverySlot: true,
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
      select: {
        id: true,
        name: true,
        courierVehicleType: true,
        courierLocation: { select: { governorate: true } },
      },
    }),
    getPlatformSettings(),
  ]);

  // Parcel weights (the same numbers capacity-aware auto-assignment uses),
  // both per row and summed per assigned courier so the pickers show what a
  // driver is already carrying.
  const metricsBySubOrder = await subOrderMetrics(
    shipments.map((s) => s.subOrder.id),
  );
  const kg = (grams: number) =>
    format.number(grams / 1000, { maximumFractionDigits: 1 });
  const loadByDriver = new Map<string, { count: number; grams: number }>();
  for (const s of shipments) {
    if (!s.driverId) continue;
    const cur = loadByDriver.get(s.driverId) ?? { count: 0, grams: 0 };
    cur.count += 1;
    cur.grams += metricsBySubOrder.get(s.subOrder.id)?.weightGrams ?? 0;
    loadByDriver.set(s.driverId, cur);
  }

  const tCouriers = await getTranslations("AdminCouriers");
  const courierOptions = couriers.map((c) => {
    const load = loadByDriver.get(c.id);
    const parts = [
      c.name ?? c.id.slice(-6),
      c.courierLocation?.governorate,
      c.courierVehicleType
        ? tCouriers(`vehicle_${c.courierVehicleType}`)
        : null,
      load
        ? t("optionLoad", { count: load.count, kg: kg(load.grams) })
        : null,
    ].filter(Boolean);
    return { id: c.id, name: parts.join(" · ") };
  });

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

  // Unassigned parcels grouped by destination governorate, for bulk assignment.
  const bulkGroups = Object.entries(
    rows
      .filter((s) => !s.driverId)
      .reduce<Record<string, string[]>>((acc, s) => {
        const gov = s.subOrder.order.address.governorate;
        (acc[gov] ??= []).push(s.id);
        return acc;
      }, {}),
  )
    .map(([governorate, ids]) => ({ governorate, ids }))
    .sort((a, b) => b.ids.length - a.ids.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Route className="size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
        </div>
        <Link
          href={`${base}/dispatch/analytics`}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm hover:underline"
        >
          <BarChart3 className="size-4" /> {t("performance")}
        </Link>
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
      ) : (
        <DispatchBulkAssign groups={bulkGroups} couriers={courierOptions} />
      )}

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
                  {s.status === "FAILED" || s.attemptCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded bg-orange-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-orange-600">
                      <RotateCcw className="size-3" />{" "}
                      {t("attempts", { count: s.attemptCount })}
                    </span>
                  ) : null}
                  {s.subOrder.order.deliveryDate &&
                  s.subOrder.order.deliverySlot ? (
                    <DeliveryWindowBadge
                      date={s.subOrder.order.deliveryDate}
                      slot={s.subOrder.order.deliverySlot}
                    />
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
                  <span className="ms-2 inline-flex items-center gap-1">
                    <Weight className="size-3.5" />
                    {t("parcelWeight", {
                      kg: kg(metricsBySubOrder.get(s.subOrder.id)?.weightGrams ?? 0),
                    })}
                  </span>
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
