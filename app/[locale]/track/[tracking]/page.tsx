import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2, MapPin, Package, Truck } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";
import { SITE_URL } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { QrCode } from "@/components/orders/qr-code";

// Public shipment tracking — reachable by anyone holding the tracking number
// (the Hezalli Express carrier link points here: hezalli.com/track/{tracking}).
// Privacy: shows only coarse info (masked order ref, carrier, destination
// city/governorate, status timeline) — never the buyer's name, phone, or full
// address.
export default async function TrackingPage({
  params,
}: {
  params: Promise<{ tracking: string }>;
}) {
  const { tracking: raw } = await params;
  const tracking = decodeURIComponent(raw).trim();
  const t = await getTranslations("Tracking");
  const tShip = await getTranslations("Orders");
  const format = await getFormatter();
  const locale = await getLocale();

  const shipment = tracking
    ? await prisma.shipment.findFirst({
        where: { trackingNumber: tracking },
        orderBy: { createdAt: "desc" },
        select: {
          status: true,
          shippedAt: true,
          deliveredAt: true,
          carrier: { select: { name: true } },
          events: {
            orderBy: { createdAt: "asc" },
            select: { id: true, status: true, note: true, createdAt: true },
          },
          subOrder: {
            select: {
              status: true,
              shippingMethod: true,
              store: { select: { name: true } },
              order: {
                select: {
                  id: true,
                  address: {
                    select: { city: true, governorate: true },
                  },
                },
              },
            },
          },
        },
      })
    : null;

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Package className="text-primary size-6" />
        <span className="text-lg font-bold tracking-tight">Hezalli</span>
      </div>
      {children}
    </main>
  );

  if (!shipment) {
    return (
      <Shell>
        <div className="rounded-xl border border-dashed p-8 text-center">
          <h1 className="text-lg font-semibold">{t("notFoundTitle")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("notFoundBody")}
          </p>
          {tracking ? (
            <p className="mt-3 font-mono text-xs tracking-widest">{tracking}</p>
          ) : null}
        </div>
      </Shell>
    );
  }

  const sub = shipment.subOrder;
  const isExpress = sub?.shippingMethod === "EXPRESS";
  const orderRef = sub ? `#${sub.order.id.slice(-8).toUpperCase()}` : "—";
  const dest = sub?.order.address
    ? `${sub.order.address.city}, ${sub.order.address.governorate}`
    : null;
  const delivered =
    shipment.status === "DELIVERED" ||
    sub?.status === "DELIVERED" ||
    sub?.status === "COMPLETED";

  // Estimated delivery window (Express buyers paid for the faster promise).
  let estimate: { from: Date; to: Date } | null = null;
  if (!delivered && shipment.shippedAt) {
    const s = await getPlatformSettings();
    const [min, max] = isExpress
      ? [s.express_eta_min_days, s.express_eta_max_days]
      : [s.std_eta_min_days, s.std_eta_max_days];
    estimate = {
      from: new Date(shipment.shippedAt.getTime() + min * 86_400_000),
      to: new Date(shipment.shippedAt.getTime() + max * 86_400_000),
    };
  }

  const trackUrl = `${SITE_URL}/${locale}/track/${encodeURIComponent(tracking)}`;

  return (
    <Shell>
      {/* Current status hero */}
      <div className="rounded-xl border p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t("currentStatus")}
          </span>
          {isExpress ? (
            <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600">
              {t("express")}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {delivered ? (
            <CheckCircle2 className="size-6 text-emerald-600" />
          ) : (
            <Truck className="text-primary size-6" />
          )}
          <span className="text-xl font-semibold">
            {tShip(`shipStatus_${shipment.status}`)}
          </span>
        </div>
        {estimate ? (
          <p className="text-muted-foreground mt-2 text-sm">
            {t("estimatedDelivery")}:{" "}
            <span className="text-foreground font-medium">
              {estimate.from.getTime() === estimate.to.getTime()
                ? format.dateTime(estimate.to, { dateStyle: "medium" })
                : `${format.dateTime(estimate.from, {
                    dateStyle: "medium",
                  })} – ${format.dateTime(estimate.to, { dateStyle: "medium" })}`}
            </span>
          </p>
        ) : null}
      </div>

      {/* Meta */}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">{t("order")}</dt>
          <dd className="font-medium" dir="ltr">
            {orderRef}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t("carrier")}</dt>
          <dd className="font-medium">{shipment.carrier?.name ?? "—"}</dd>
        </div>
        {dest ? (
          <div className="col-span-2">
            <dt className="text-muted-foreground text-xs">
              {t("destination")}
            </dt>
            <dd className="flex items-center gap-1 font-medium">
              <MapPin className="text-muted-foreground size-3.5" /> {dest}
            </dd>
          </div>
        ) : null}
      </dl>

      {/* Timeline */}
      <div className="mt-5">
        <h2 className="mb-3 text-sm font-semibold">{t("history")}</h2>
        {shipment.events.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noEvents")}</p>
        ) : (
          <ol className="space-y-3">
            {shipment.events.map((ev, i) => (
              <li key={ev.id} className="flex gap-3 text-sm">
                <span
                  className={cn(
                    "mt-1.5 size-2.5 shrink-0 rounded-full",
                    i === shipment.events.length - 1
                      ? "bg-primary"
                      : "bg-muted-foreground/40",
                  )}
                />
                <span>
                  <span className="font-medium">
                    {tShip(`shipStatus_${ev.status}`)}
                  </span>
                  {ev.note ? (
                    <span className="text-muted-foreground"> — {ev.note}</span>
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
        )}
      </div>

      {/* Shareable QR */}
      <div className="mt-auto flex flex-col items-center gap-2 pt-8">
        <QrCode value={trackUrl} size={104} />
        <p className="text-muted-foreground text-center text-xs">
          {t("scanHint")}
        </p>
      </div>
    </Shell>
  );
}
