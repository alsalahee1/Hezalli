import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const BADGE: Record<string, string> = {
  OPEN: "bg-amber-500/15 text-amber-600",
  UNDER_REVIEW: "bg-blue-500/15 text-blue-600",
  RESOLVED_BUYER: "bg-emerald-500/15 text-emerald-600",
  RESOLVED_SELLER: "bg-emerald-500/15 text-emerald-600",
  CLOSED: "bg-muted text-muted-foreground",
};

const ACTIVE = ["OPEN", "UNDER_REVIEW"];

export default async function AdminDisputesPage() {
  const t = await getTranslations("AdminDisputes");
  const format = await getFormatter();

  const disputes = await prisma.dispute.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      createdAt: true,
      returnRequest: {
        select: {
          reason: true,
          buyer: { select: { name: true } },
          subOrder: {
            select: {
              itemsTotal: true,
              shippingTotal: true,
              order: { select: { id: true } },
              store: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const active = disputes.filter((d) => ACTIVE.includes(d.status));
  const resolved = disputes.filter((d) => !ACTIVE.includes(d.status));
  const money = (n: unknown) =>
    format.number(Number(n), { style: "currency", currency: "USD" });

  const row = (d: (typeof disputes)[number]) => {
    const r = d.returnRequest;
    const amount =
      Number(r.subOrder.itemsTotal) + Number(r.subOrder.shippingTotal);
    return (
      <Link
        key={d.id}
        href={`/admin/disputes/${d.id}`}
        className="hover:border-muted-foreground/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
      >
        <div className="min-w-0 text-sm">
          <p className="font-medium">
            #{r.subOrder.order.id.slice(-8).toUpperCase()} ·{" "}
            {r.subOrder.store.name}
          </p>
          <p className="text-muted-foreground">
            {r.buyer.name ?? "—"} ·{" "}
            {format.dateTime(d.createdAt, { dateStyle: "medium" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold" dir="ltr">
            {money(amount)}
          </span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-xs font-medium",
              BADGE[d.status] ?? "bg-muted",
            )}
          >
            {t(`status_${d.status}`)}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">{t("openTitle")}</h2>
        {active.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
            {t("noOpen")}
          </div>
        ) : (
          <div className="space-y-3">{active.map(row)}</div>
        )}
      </section>

      {resolved.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-semibold">{t("resolvedTitle")}</h2>
          <div className="space-y-3">{resolved.map(row)}</div>
        </section>
      ) : null}
    </div>
  );
}
