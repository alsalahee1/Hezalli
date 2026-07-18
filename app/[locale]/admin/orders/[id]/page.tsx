import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { STATUS_BADGE } from "@/lib/order-status";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { RefundButton } from "@/components/admin/refund-button";

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("AdminOrders");
  const format = await getFormatter();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      buyer: { select: { name: true, email: true } },
      address: true,
      subOrders: {
        include: {
          store: { select: { name: true } },
          items: true,
        },
      },
    },
  });
  if (!order) notFound();

  const refunds = await prisma.refund.findMany({
    where: { subOrderId: { in: order.subOrders.map((s) => s.id) } },
    select: { subOrderId: true, amountUsd: true, reason: true },
  });
  const refundBySub = new Map<string, number>();
  for (const r of refunds) {
    refundBySub.set(
      r.subOrderId ?? "",
      (refundBySub.get(r.subOrderId ?? "") ?? 0) + Number(r.amountUsd),
    );
  }

  const money = (n: unknown) =>
    format.number(Number(n), { style: "currency", currency: "USD" });

  return (
    <div className="space-y-6">
      <Link
        href="/admin/orders"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("back")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            #{order.id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-muted-foreground text-sm">
            {order.buyer.name} · {order.paymentMethod} ·{" "}
            {format.dateTime(order.createdAt, { dateStyle: "medium" })}
          </p>
        </div>
        <span
          className={cn(
            "rounded px-2 py-1 text-sm font-medium",
            STATUS_BADGE[order.status] ?? "bg-muted",
          )}
        >
          {t(`status_${order.status}`)}
        </span>
      </div>

      {order.subOrders.map((s) => {
        const subTotal = Number(s.itemsTotal) + Number(s.shippingTotal);
        return (
          <section key={s.id} className="rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
              <span className="text-sm font-medium">{s.store.name}</span>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-medium",
                    STATUS_BADGE[s.status] ?? "bg-muted",
                  )}
                >
                  {t(`status_${s.status}`)}
                </span>
                <RefundButton
                  subOrderId={s.id}
                  maxAmount={Math.round(subTotal * 100) / 100}
                  alreadyRefunded={
                    s.status === "REFUNDED" || refundBySub.has(s.id)
                  }
                />
              </div>
            </div>
            <ul className="divide-y">
              {s.items.map((it) => (
                <li
                  key={it.id}
                  className="flex justify-between gap-3 p-4 text-sm"
                >
                  <span className="line-clamp-1">
                    {it.titleSnapshot} · ×{it.quantity}
                  </span>
                  <span dir="ltr">{money(it.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t px-4 py-2 text-sm">
              <span className="text-muted-foreground">{t("subTotal")}</span>
              <span dir="ltr">{money(subTotal)}</span>
            </div>
          </section>
        );
      })}
    </div>
  );
}
