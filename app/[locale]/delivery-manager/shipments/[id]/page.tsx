import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { buildTrackingUrl } from "@/lib/tracking";
import { Link } from "@/i18n/navigation";
import { ShipmentOverride } from "@/components/delivery-manager/shipment-override";

export const dynamic = "force-dynamic";

export default async function DeliveryManagerShipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("DeliveryManager");
  const format = await getFormatter();

  const [shipment, carriers] = await Promise.all([
    prisma.shipment.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        trackingNumber: true,
        platformManaged: true,
        shippedAt: true,
        deliveredAt: true,
        carrierId: true,
        carrier: { select: { name: true, trackingUrl: true } },
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
        subOrder: {
          select: {
            id: true,
            status: true,
            orderId: true,
            store: { select: { name: true } },
            order: {
              select: {
                buyer: { select: { name: true } },
                address: {
                  select: { governorate: true, city: true, line1: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.carrier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!shipment) notFound();

  const trackUrl = shipment.trackingNumber
    ? buildTrackingUrl(
        shipment.carrier?.trackingUrl ?? null,
        shipment.trackingNumber,
      )
    : null;
  const addr = shipment.subOrder.order.address;

  const facts: [string, React.ReactNode][] = [
    [t("store"), shipment.subOrder.store.name],
    [t("buyer"), shipment.subOrder.order.buyer.name ?? "—"],
    [t("destination"), `${addr.governorate} · ${addr.city} · ${addr.line1}`],
    [t("carrier"), shipment.carrier?.name ?? "—"],
    [
      t("trackingNumber"),
      trackUrl ? (
        <a
          key="trk"
          href={trackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
          dir="ltr"
        >
          {shipment.trackingNumber}
        </a>
      ) : (
        (shipment.trackingNumber ?? "—")
      ),
    ],
    [t("subOrderStatus"), shipment.subOrder.status],
    [
      t("shippedAt"),
      shipment.shippedAt
        ? format.dateTime(shipment.shippedAt, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "—",
    ],
    [
      t("deliveredAt"),
      shipment.deliveredAt
        ? format.dateTime(shipment.deliveredAt, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "—",
    ],
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/delivery-manager/shipments"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" /> {t("backToShipments")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            #{shipment.subOrder.id.slice(-8).toUpperCase()}
          </h1>
          <span className="bg-muted rounded-full px-2.5 py-0.5 text-xs font-medium">
            {t(`shipStatus_${shipment.status}`)}
          </span>
          {shipment.platformManaged ? (
            <span className="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-medium">
              {t("platformManaged")}
            </span>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border p-4 text-sm lg:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-0.5 font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <ShipmentOverride
        shipmentId={shipment.id}
        currentStatus={shipment.status}
        carrierId={shipment.carrierId}
        trackingNumber={shipment.trackingNumber}
        carriers={carriers}
      />

      <section className="space-y-3">
        <h2 className="font-medium">{t("events")}</h2>
        {shipment.events.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noEvents")}</p>
        ) : (
          <ol className="space-y-0">
            {shipment.events.map((e, i) => (
              <li key={e.id} className="relative flex gap-3 pb-4">
                <div className="flex flex-col items-center">
                  <span
                    className={`mt-1 size-2.5 shrink-0 rounded-full ${i === 0 ? "bg-primary" : "bg-muted-foreground/40"}`}
                  />
                  {i < shipment.events.length - 1 ? (
                    <span className="bg-border w-px flex-1" />
                  ) : null}
                </div>
                <div className="text-sm">
                  <p className="font-medium">{t(`shipStatus_${e.status}`)}</p>
                  <p className="text-muted-foreground text-xs">
                    {format.dateTime(e.createdAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {e.location ? ` · ${e.location}` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Link
        href={`/admin/orders/${shipment.subOrder.orderId}`}
        className="text-primary inline-block text-sm font-medium hover:underline"
      >
        {t("viewOrder")}
      </Link>
    </div>
  );
}
