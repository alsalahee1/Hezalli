import { getFormatter, getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  Banknote,
  MapPin,
  Package,
  PackageSearch,
  Route,
  Store,
} from "lucide-react";

import { requireCourierId } from "@/lib/authz";
import { courierCodStatus } from "@/lib/cod-guard";
import { boardReadyAtPoint, openBoardWhere } from "@/lib/job-board";
import { codSettledDigitally } from "@/lib/payment-state";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";
import { haversineKm } from "@/lib/yemen-geo";
import { Link } from "@/i18n/navigation";
import { ClaimButton } from "@/components/driver/claim-button";
import { DeliveryWindowBadge } from "@/components/orders/delivery-window-badge";

// The open job board (docs/EXPRESS-DELIVERY.md §4b): every unassigned,
// courier-ready platform parcel, claimable by the first eligible driver. The
// card shows what a driver weighs before committing — destination, size, COD
// to collect, their fee, the delivery window — but NOT the buyer's name,
// phone, or street address: those stay private until the job is theirs.
export default async function DriverBoardPage() {
  const courierId = await requireCourierId();
  if (!courierId) return null;
  const t = await getTranslations("Driver");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [settings, rawJobs, location, cod] = await Promise.all([
    getPlatformSettings(),
    prisma.shipment.findMany({
      where: openBoardWhere(),
      orderBy: { boardedAt: "asc" },
      take: 100,
      select: {
        id: true,
        status: true,
        boardedAt: true,
        deliveryPointId: true,
        atPointId: true,
        deliveryPoint: { select: { name: true, city: true } },
        subOrder: {
          select: {
            itemsTotal: true,
            shippingTotal: true,
            discountTotal: true,
            store: { select: { name: true } },
            items: { select: { quantity: true } },
            order: {
              select: {
                paymentMethod: true,
                deliveryDate: true,
                deliverySlot: true,
                payment: { select: { status: true, confirmedBy: true } },
                address: {
                  select: {
                    city: true,
                    governorate: true,
                    lat: true,
                    lng: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.courierLocation.findUnique({
      where: { userId: courierId },
      select: { governorate: true, lat: true, lng: true },
    }),
    courierCodStatus(courierId),
  ]);

  const jobs = rawJobs
    .filter(boardReadyAtPoint)
    .map((j) => {
      const addr = j.subOrder.order.address;
      const km =
        location && addr.lat != null && addr.lng != null
          ? haversineKm(location.lat, location.lng, addr.lat, addr.lng)
          : null;
      const codDue =
        j.subOrder.order.paymentMethod === "COD" &&
        !codSettledDigitally(j.subOrder.order);
      return {
        ...j,
        km,
        codDue,
        codAmount:
          Number(j.subOrder.itemsTotal) +
          Number(j.subOrder.shippingTotal) -
          Number(j.subOrder.discountTotal),
        pieces: j.subOrder.items.reduce((n, it) => n + it.quantity, 0),
        local: location?.governorate === addr.governorate,
      };
    })
    // Jobs in the driver's governorate first, then nearest, then oldest.
    .sort(
      (a, b) =>
        Number(b.local) - Number(a.local) ||
        (a.km ?? Infinity) - (b.km ?? Infinity) ||
        (a.boardedAt?.getTime() ?? 0) - (b.boardedAt?.getTime() ?? 0),
    );

  return (
    <div className="space-y-4">
      <Link
        href="/driver"
        className="text-muted-foreground text-sm hover:underline"
      >
        ← {t("back")}
      </Link>

      <div>
        <h1 className="text-lg font-semibold">{t("boardTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("boardSubtitle")}</p>
      </div>

      {!settings.job_board_enabled ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
          <PackageSearch className="mx-auto mb-2 size-8 opacity-50" />
          {t("boardDisabled")}
        </div>
      ) : (
        <>
          {/* A COD-blocked driver can browse but not claim — same rule and
              same explanation as the assignment block on the home screen. */}
          {cod.blocked ? (
            <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-400">
                <AlertTriangle className="size-4" /> {t("codBlockedTitle")}
              </p>
              <p className="mt-1 text-sm">{t("boardCodBlocked")}</p>
            </div>
          ) : null}

          {jobs.length === 0 ? (
            <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
              <PackageSearch className="mx-auto mb-2 size-8 opacity-50" />
              {t("boardEmpty")}
            </div>
          ) : (
            <ul className="space-y-3">
              {jobs.map((j) => (
                <li key={j.id} className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <MapPin className="text-muted-foreground size-4 shrink-0" />
                        {j.subOrder.order.address.city},{" "}
                        {j.subOrder.order.address.governorate}
                      </p>
                      <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                        <Store className="size-3.5 shrink-0" />
                        {j.deliveryPoint
                          ? t("boardFromPoint", {
                              point: `${j.deliveryPoint.name} (${j.deliveryPoint.city})`,
                            })
                          : t("boardFromStore", {
                              store: j.subOrder.store.name,
                            })}
                      </p>
                    </div>
                    {j.boardedAt ? (
                      <span className="text-muted-foreground shrink-0 text-[11px]">
                        {format.relativeTime(j.boardedAt)}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                    <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5">
                      <Package className="size-3" />
                      {t("boardItems", { count: j.pieces })}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-500">
                      <Banknote className="size-3" />
                      {t("boardFee", {
                        amount: money(settings.courier_delivery_fee),
                      })}
                    </span>
                    {j.codDue ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-500">
                        {t("boardCod", { amount: money(j.codAmount) })}
                      </span>
                    ) : (
                      <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5">
                        {t("boardPrepaid")}
                      </span>
                    )}
                    {j.km != null ? (
                      <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5">
                        <Route className="size-3" />
                        {t("boardDistance", { km: Math.round(j.km) })}
                      </span>
                    ) : null}
                  </div>

                  {j.subOrder.order.deliveryDate &&
                  j.subOrder.order.deliverySlot ? (
                    <DeliveryWindowBadge
                      date={j.subOrder.order.deliveryDate}
                      slot={j.subOrder.order.deliverySlot}
                    />
                  ) : null}

                  {cod.blocked ? null : <ClaimButton shipmentId={j.id} />}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
