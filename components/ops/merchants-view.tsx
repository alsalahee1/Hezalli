import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { MerchantApplicationActions } from "@/components/admin/merchant-application-actions";
import { MerchantStatusToggle } from "@/components/admin/merchant-status-toggle";

// Admin review queue for "become a HezalliPay merchant" applications plus the
// live merchant network: each merchant's total takings and a suspend/activate
// toggle. Mirrors the points admin page.
export async function MerchantsView() {
  const t = await getTranslations("AdminMerchants");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [applications, merchants, takings] = await Promise.all([
    prisma.merchantApplication.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.merchantProfile.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        businessName: true,
        category: true,
        governorate: true,
        city: true,
        status: true,
        owner: { select: { name: true, email: true } },
      },
    }),
    prisma.merchantPayment.groupBy({
      by: ["merchantId"],
      _sum: { amountUsd: true },
    }),
  ]);

  const takingsBy = new Map(
    takings.map((g) => [g.merchantId, Number(g._sum.amountUsd ?? 0)]),
  );

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
                    <p className="font-medium">{a.businessName}</p>
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
                    {t(`cat_${a.category}`)}
                  </span>
                  <span className="text-muted-foreground">
                    {a.governorate} — {a.city}
                  </span>
                </div>

                {a.notes ? (
                  <p className="text-muted-foreground mt-2 text-sm">
                    {a.notes}
                  </p>
                ) : null}

                <MerchantApplicationActions applicationId={a.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Live network */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          {t("networkHeading")} ({merchants.length})
        </h2>
        {merchants.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noMerchants")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {merchants.map((m) => {
              const total = takingsBy.get(m.id) ?? 0;
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{m.businessName}</span>{" "}
                    <span className="text-muted-foreground text-xs">
                      {t(`cat_${m.category}`)} · {m.city}, {m.governorate} ·{" "}
                      {m.owner.email}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {total > 0 ? (
                      <span
                        className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-600"
                        dir="ltr"
                        title={t("takings")}
                      >
                        {money(total)}
                      </span>
                    ) : null}
                    {m.status === "SUSPENDED" ? (
                      <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs font-medium">
                        {t("suspended")}
                      </span>
                    ) : null}
                    <MerchantStatusToggle merchantId={m.id} status={m.status} />
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
                  <span className="font-medium">{a.businessName}</span>{" "}
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
