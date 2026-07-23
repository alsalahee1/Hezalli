import { getFormatter, getTranslations } from "next-intl/server";
import { CalendarClock, MapPin, PackageX, Truck } from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// One parcel's full story for the counter: current state, route, and the
// scan-by-scan event trail. The trail is the hub's custody evidence (docs
// §4) — this page is how the operator answers "when did that parcel leave
// my shop, and with whom?". Resolves a tracking number or a shipment id
// (notification links carry the id), and only for parcels that actually
// involve this hub.
export default async function PointParcelPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  const { code } = await params;
  const t = await getTranslations("Point");
  const tShip = await getTranslations("Orders");
  const format = await getFormatter();
  const q = decodeURIComponent(code).trim();

  const shipment = q
    ? await prisma.shipment.findFirst({
        where: {
          OR: [{ trackingNumber: q }, { id: q }],
          // Scoped to parcels this hub is (or was) part of.
          AND: {
            OR: [
              { deliveryPointId: gate.pointId },
              { originPointId: gate.pointId },
              { atPointId: gate.pointId },
            ],
          },
        },
        select: {
          id: true,
          status: true,
          trackingNumber: true,
          shelfCode: true,
          atPointId: true,
          originPointId: true,
          deliveryPointId: true,
          attemptCount: true,
          redeliverAt: true,
          redeliverNote: true,
          shippedAt: true,
          deliveredAt: true,
          driver: { select: { name: true, email: true } },
          events: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              location: true,
              note: true,
              createdAt: true,
            },
          },
          attempts: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              outcome: true,
              reason: true,
              recipientName: true,
              createdAt: true,
            },
          },
          subOrder: {
            select: {
              shippingMethod: true,
              store: { select: { name: true } },
              order: {
                select: {
                  address: {
                    select: { fullName: true, city: true, governorate: true },
                  },
                },
              },
            },
          },
        },
      })
    : null;

  if (!shipment) {
    // No tracking/id match — try the name the customer actually gives the
    // counter: the buyer on the parcel, across this hub's parcels.
    const matches =
      q.length >= 2
        ? await prisma.shipment.findMany({
            where: {
              OR: [
                { deliveryPointId: gate.pointId },
                { originPointId: gate.pointId },
                { atPointId: gate.pointId },
              ],
              subOrder: {
                order: {
                  address: {
                    fullName: { contains: q, mode: "insensitive" },
                  },
                },
              },
            },
            orderBy: { updatedAt: "desc" },
            take: 10,
            select: {
              id: true,
              trackingNumber: true,
              status: true,
              updatedAt: true,
              subOrder: {
                select: {
                  store: { select: { name: true } },
                  order: {
                    select: {
                      address: { select: { fullName: true, city: true } },
                    },
                  },
                },
              },
            },
          })
        : [];

    if (matches.length > 0) {
      return (
        <div className="space-y-4">
          <div>
            <h1 className="text-lg font-semibold">{t("searchResultsTitle")}</h1>
            <p className="text-muted-foreground text-sm">
              {t("searchResultsFor", { query: q })}
            </p>
          </div>
          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/point/parcel/${m.id}`}
                  className="hover:border-primary/50 block rounded-xl border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium" dir="ltr">
                      {m.trackingNumber ?? m.id.slice(-8).toUpperCase()}
                    </span>
                    <span className="bg-muted rounded px-1.5 py-0.5 text-[11px] font-medium">
                      {tShip(`shipStatus_${m.status}`)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm">
                    {m.subOrder.store.name} →{" "}
                    {m.subOrder.order.address.fullName} ·{" "}
                    {m.subOrder.order.address.city}
                  </p>
                  <p className="text-muted-foreground text-xs" dir="ltr">
                    {format.dateTime(m.updatedAt, { dateStyle: "medium" })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/point/history"
            className="text-muted-foreground hover:text-foreground block text-center text-sm"
          >
            {t("back")}
          </Link>
        </div>
      );
    }

    return (
      <div className="space-y-4 py-10 text-center">
        <PackageX className="text-muted-foreground mx-auto size-10" />
        <div>
          <h1 className="font-semibold">{t("parcelNotFoundTitle")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("parcelNotFoundBody")}
          </p>
          {q ? (
            <p className="mt-2 font-mono text-xs" dir="ltr">
              {q}
            </p>
          ) : null}
        </div>
        <Link
          href="/point/history"
          className="text-primary inline-block text-sm font-medium hover:underline"
        >
          {t("back")}
        </Link>
      </div>
    );
  }

  const s = shipment;
  const terminal = s.status === "DELIVERED" || s.status === "RETURNED";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold" dir="ltr">
          {s.trackingNumber ?? s.id.slice(-8).toUpperCase()}
        </h1>
        <span
          className={cn(
            "rounded px-2 py-0.5 text-xs font-semibold",
            s.status === "DELIVERED"
              ? "bg-emerald-500/15 text-emerald-600"
              : s.status === "RETURNED" || s.status === "FAILED"
                ? "bg-red-500/15 text-red-600"
                : "bg-muted",
          )}
        >
          {tShip(`shipStatus_${s.status}`)}
        </span>
      </div>

      <div className="space-y-1.5 rounded-xl border p-4 text-sm">
        <p className="truncate">
          {s.subOrder.store.name} → {s.subOrder.order.address.fullName}
        </p>
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          <MapPin className="size-3" />
          {s.subOrder.order.address.city},{" "}
          {s.subOrder.order.address.governorate}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {s.subOrder.shippingMethod === "PICKUP" ? (
            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-sky-600">
              {t("pickupBadge")}
            </span>
          ) : null}
          {s.originPointId && s.originPointId !== s.deliveryPointId ? (
            <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-600">
              {t("transferBadge")}
            </span>
          ) : null}
          {s.shelfCode && s.atPointId === gate.pointId && !terminal ? (
            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-sky-600">
              {t("shelfBadge", { code: s.shelfCode })}
            </span>
          ) : null}
        </div>
        {s.driver ? (
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
            <Truck className="size-3" /> {t("driver")}:{" "}
            {s.driver.name ?? s.driver.email}
          </p>
        ) : null}
        {s.redeliverAt ? (
          <p className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-500">
            <CalendarClock className="size-3.5" />
            {t("redeliverOn", {
              date: format.dateTime(s.redeliverAt, { dateStyle: "medium" }),
            })}
            {s.redeliverNote ? ` — ${s.redeliverNote}` : null}
          </p>
        ) : null}
      </div>

      {s.attempts.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-semibold">
            {t("attemptsTitle")}
          </h2>
          <ul className="divide-y rounded-xl border">
            {s.attempts.map((a) => (
              <li key={a.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "font-medium",
                      a.outcome === "DELIVERED"
                        ? "text-emerald-600"
                        : "text-red-600",
                    )}
                  >
                    {a.outcome === "DELIVERED"
                      ? tShip("shipStatus_DELIVERED")
                      : tShip("shipStatus_FAILED")}
                  </span>
                  <span className="text-muted-foreground text-xs" dir="ltr">
                    {format.dateTime(a.createdAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
                {a.recipientName || a.reason ? (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {a.recipientName ?? a.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-muted-foreground text-sm font-semibold">
          {t("timelineTitle")}
        </h2>
        <ul className="divide-y rounded-xl border">
          {s.events.map((e) => (
            <li key={e.id} className="px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {tShip(`shipStatus_${e.status}`)}
                </span>
                <span className="text-muted-foreground text-xs" dir="ltr">
                  {format.dateTime(e.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              {e.location || e.note ? (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {[e.location, e.note].filter(Boolean).join(" — ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/point/history"
        className="text-muted-foreground hover:text-foreground block text-center text-sm"
      >
        {t("back")}
      </Link>
    </div>
  );
}
