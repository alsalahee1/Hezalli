import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { setPointStatus } from "@/lib/actions/point-application";
import { getSetting } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { PointApplicationActions } from "@/components/admin/point-application-actions";
import { Button } from "@/components/ui/button";

// Admin review queue for "become a delivery point" applications plus the live
// partner-hub network: each point's held-parcel count, balance owed, and a
// suspend/activate toggle. Mirrors the couriers admin page.
export async function PointsView({ base }: { base: string }) {
  const t = await getTranslations("AdminPoints");
  const format = await getFormatter();

  const staleDays = await getSetting("stale_parcel_days");
  const staleBefore = new Date(Date.now() - staleDays * 86_400_000);
  const [applications, points, balances, held, stale] = await Promise.all([
    prisma.deliveryPointApplication.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.deliveryPoint.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        governorate: true,
        city: true,
        phone: true,
        status: true,
        capacity: true,
        owner: { select: { name: true, email: true } },
      },
    }),
    // Signed sums per point per type: earnings side (fees/payouts/adjustments)
    // and cash side (counter COD collected/remitted) are kept apart.
    prisma.deliveryPointLedgerEntry.groupBy({
      by: ["pointId", "type"],
      _sum: { amountUsd: true },
    }),
    // Load = parcels held or inbound (same definition as lib/point-select.ts).
    prisma.shipment.groupBy({
      by: ["deliveryPointId"],
      where: {
        deliveryPointId: { not: null },
        status: { in: ["LABEL_CREATED", "AT_POINT", "RETURNED_TO_POINT"] },
        subOrder: { status: "SHIPPED" },
      },
      _count: { _all: true },
    }),
    // Held parcels that haven't moved past the stale threshold, per hub.
    prisma.shipment.groupBy({
      by: ["atPointId"],
      where: {
        atPointId: { not: null },
        updatedAt: { lt: staleBefore },
        subOrder: { status: "SHIPPED" },
      },
      _count: { _all: true },
    }),
  ]);

  const EARNING_TYPES = new Set(["HANDLING_FEE", "PAYOUT", "ADJUSTMENT"]);
  const balanceBy = new Map<string, number>();
  const cashBy = new Map<string, number>();
  for (const g of balances) {
    const target = EARNING_TYPES.has(g.type) ? balanceBy : cashBy;
    target.set(
      g.pointId,
      (target.get(g.pointId) ?? 0) + Number(g._sum.amountUsd ?? 0),
    );
  }
  const heldBy = new Map(held.map((g) => [g.deliveryPointId, g._count._all]));
  const staleBy = new Map(stale.map((g) => [g.atPointId, g._count._all]));
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const pending = applications.filter((a) => a.status === "PENDING");
  const decided = applications.filter((a) => a.status !== "PENDING");

  const statusBadge: Record<string, string> = {
    PENDING: "bg-amber-500/15 text-amber-600",
    APPROVED: "bg-emerald-500/15 text-emerald-600",
    REJECTED: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>

      {/* Pending queue */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          {t("pendingHeading")} ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noPending")}</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((a) => (
              <li key={a.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{a.pointName}</p>
                    <p className="text-muted-foreground text-xs">
                      {a.fullName} · {a.user.email}
                    </p>
                  </div>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {format.dateTime(a.createdAt, { dateStyle: "medium" })}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span dir="ltr">{a.phone}</span>
                  <span className="text-muted-foreground">
                    {a.governorate} — {a.city}
                  </span>
                  <span className="text-muted-foreground">{a.addressLine}</span>
                </div>

                {a.notes ? (
                  <p className="text-muted-foreground mt-2 text-sm">
                    {a.notes}
                  </p>
                ) : null}

                <PointApplicationActions applicationId={a.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Live network */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          {t("networkHeading")} ({points.length})
        </h2>
        {points.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noPoints")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {points.map((p) => {
              const balance = balanceBy.get(p.id) ?? 0;
              const cash = cashBy.get(p.id) ?? 0;
              const holding = heldBy.get(p.id) ?? 0;
              const staleCount = staleBy.get(p.id) ?? 0;
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                >
                  <Link
                    href={`${base}/points/${p.id}`}
                    className="min-w-0 flex-1 hover:underline"
                  >
                    <span className="font-medium">{p.name}</span>{" "}
                    <span className="text-muted-foreground text-xs">
                      {p.city}, {p.governorate} · {p.owner.email}
                    </span>
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    {holding > 0 || p.capacity != null ? (
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs font-medium",
                          p.capacity != null && holding >= p.capacity
                            ? "bg-red-500/15 text-red-600"
                            : "bg-muted",
                        )}
                        title={t("holdingParcels")}
                        dir="ltr"
                      >
                        {p.capacity != null
                          ? `${holding}/${p.capacity}`
                          : t("parcelCount", { count: holding })}
                      </span>
                    ) : null}
                    {balance > 0 ? (
                      <span
                        className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-600"
                        dir="ltr"
                        title={t("balanceOwed")}
                      >
                        {money(balance)}
                      </span>
                    ) : null}
                    {cash > 0 ? (
                      <span
                        className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600"
                        dir="ltr"
                        title={t("cashOnHand")}
                      >
                        {money(cash)}
                      </span>
                    ) : null}
                    {staleCount > 0 ? (
                      <span
                        className="rounded bg-red-500/15 px-1.5 py-0.5 text-xs font-medium text-red-600"
                        title={t("staleTitle", { days: staleDays })}
                      >
                        {t("staleCount", { count: staleCount })}
                      </span>
                    ) : null}
                    {p.status === "SUSPENDED" ? (
                      <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs font-medium">
                        {t("suspended")}
                      </span>
                    ) : null}
                    <form action={setPointStatus}>
                      <input type="hidden" name="pointId" value={p.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={p.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className={cn(
                          "h-7 text-xs",
                          p.status === "ACTIVE" && "text-destructive",
                        )}
                      >
                        {p.status === "ACTIVE" ? t("suspend") : t("activate")}
                      </Button>
                    </form>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Decided history */}
      {decided.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t("historyHeading")}</h2>
          <ul className="divide-y rounded-lg border">
            {decided.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium">{a.pointName}</span>{" "}
                  <span className="text-muted-foreground text-xs">
                    {a.user.email}
                  </span>
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
                    statusBadge[a.status],
                  )}
                >
                  {t(`status_${a.status}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
