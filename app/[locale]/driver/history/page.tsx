import { getFormatter, getTranslations } from "next-intl/server";
import { MapPin, PackageCheck } from "lucide-react";

import { requireCourierId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";

// The driver's completed deliveries (docs §30). The home page only lists
// in-progress jobs (subOrder SHIPPED); once delivered they drop off that list,
// so this is the only place a courier can look back over the drops they've made
// — order, recipient, destination, when, and the cash/fee it booked.
export default async function DriverHistoryPage() {
  const courierId = await requireCourierId();
  if (!courierId) return null;
  const t = await getTranslations("Driver");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const shipments = await prisma.shipment.findMany({
    where: { driverId: courierId, status: "DELIVERED" },
    orderBy: { deliveredAt: "desc" },
    take: 50,
    select: {
      id: true,
      deliveredAt: true,
      attempts: {
        where: { outcome: "DELIVERED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { recipientName: true },
      },
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
  });

  // Pull the COD cash + fee each of these drops booked, straight from the same
  // ledger the tiles sum (lib/courier-ledger.ts), keyed by shipment.
  const ledgerRows = shipments.length
    ? await prisma.courierLedgerEntry.groupBy({
        by: ["shipmentId", "type"],
        where: {
          courierId,
          shipmentId: { in: shipments.map((s) => s.id) },
          type: { in: ["COD_COLLECTED", "EARNING"] },
        },
        _sum: { amountUsd: true },
      })
    : [];
  const booked = new Map<string, { cod: number; fee: number }>();
  for (const r of ledgerRows) {
    if (!r.shipmentId) continue;
    const entry = booked.get(r.shipmentId) ?? { cod: 0, fee: 0 };
    const amount = Number(r._sum.amountUsd ?? 0);
    if (r.type === "COD_COLLECTED") entry.cod = amount;
    else entry.fee = amount;
    booked.set(r.shipmentId, entry);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{t("historyTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("historySubtitle")}</p>
      </div>

      {shipments.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
          <PackageCheck className="mx-auto mb-2 size-8 opacity-50" />
          {t("noHistory")}
        </div>
      ) : (
        <ul className="space-y-3">
          {shipments.map((s) => {
            const amounts = booked.get(s.id);
            return (
              <li key={s.id}>
                <div className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      #{s.subOrder.order.id.slice(-8).toUpperCase()}
                    </span>
                    {s.deliveredAt ? (
                      <span className="text-muted-foreground text-xs" dir="ltr">
                        {format.dateTime(s.deliveredAt, {
                          dateStyle: "medium",
                        })}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium">
                    {s.attempts[0]?.recipientName ||
                      s.subOrder.order.address.fullName}
                  </p>
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    <MapPin className="size-3" />
                    {s.subOrder.order.address.city},{" "}
                    {s.subOrder.order.address.governorate}
                  </p>
                  {amounts && (amounts.cod > 0 || amounts.fee > 0) ? (
                    <div className="mt-2 flex gap-4 border-t pt-2 text-xs">
                      {amounts.cod > 0 ? (
                        <span className="text-amber-700 dark:text-amber-500">
                          {t("historyCod")}:{" "}
                          <span className="font-semibold" dir="ltr">
                            {money(amounts.cod)}
                          </span>
                        </span>
                      ) : null}
                      {amounts.fee > 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-500">
                          {t("historyFee")}:{" "}
                          <span className="font-semibold" dir="ltr">
                            {money(amounts.fee)}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href="/driver"
        className="text-muted-foreground hover:text-foreground block text-center text-sm"
      >
        {t("back")}
      </Link>
    </div>
  );
}
