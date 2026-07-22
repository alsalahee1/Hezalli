import { getFormatter, getTranslations } from "next-intl/server";

import { courierRatingsByCourier } from "@/lib/courier-ratings";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { CourierApplicationActions } from "@/components/admin/courier-application-actions";

// Admin review queue for "become a driver" applications. Pending requests are
// actionable (approve → grants the COURIER role; reject → optional note);
// already-decided ones are listed below for reference. Existing couriers are
// shown so the operator can see the active fleet at a glance.
export async function CouriersView({ base }: { base: string }) {
  const t = await getTranslations("AdminCouriers");
  const format = await getFormatter();

  const [applications, couriers, ledger, ratings] = await Promise.all([
    prisma.courierApplication.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.user.findMany({
      where: { roles: { has: "COURIER" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        isSuspended: true,
        fleet: { select: { name: true } },
      },
    }),
    // Cash-on-hand per courier = sum of every ledger entry except EARNING
    // (COD_COLLECTED + REMITTANCE + ADJUSTMENT), in one pass.
    prisma.courierLedgerEntry.groupBy({
      by: ["courierId"],
      where: { type: { not: "EARNING" } },
      _sum: { amountUsd: true },
    }),
    courierRatingsByCourier(),
  ]);

  const cashByCourier = new Map(
    ledger.map((g) => [g.courierId, Number(g._sum.amountUsd ?? 0)]),
  );
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
                    <p className="font-medium">{a.fullName}</p>
                    <p className="text-muted-foreground text-xs">
                      {a.user.name ? `${a.user.name} · ` : ""}
                      {a.user.email}
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
                  <span className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium">
                    {t(`vehicle_${a.vehicleType}`)}
                  </span>
                </div>

                {a.notes ? (
                  <p className="text-muted-foreground mt-2 text-sm">
                    {a.notes}
                  </p>
                ) : null}

                <CourierApplicationActions applicationId={a.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Active fleet */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          {t("fleetHeading")} ({couriers.length})
        </h2>
        {couriers.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noCouriers")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {couriers.map((c) => {
              const cash = cashByCourier.get(c.id) ?? 0;
              const rating = ratings.get(c.id);
              return (
                <li key={c.id}>
                  <Link
                    href={`${base}/couriers/${c.id}`}
                    className="hover:bg-muted/50 flex items-center justify-between gap-2 px-3 py-2.5 text-sm transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{c.name ?? "—"}</span>{" "}
                      <span className="text-muted-foreground text-xs">
                        {c.email}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {c.fleet ? (
                        <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-400">
                          {c.fleet.name}
                        </span>
                      ) : null}
                      {rating ? (
                        <span
                          className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-600"
                          title={t("ratingCount", { count: rating.count })}
                          dir="ltr"
                        >
                          ★ {rating.avg.toFixed(1)}
                        </span>
                      ) : null}
                      {c.isSuspended ? (
                        <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs font-medium">
                          {t("suspended")}
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
                    </span>
                  </Link>
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
                  <span className="font-medium">{a.fullName}</span>{" "}
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
