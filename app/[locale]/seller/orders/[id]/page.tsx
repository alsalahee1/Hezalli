import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Printer } from "lucide-react";

import { requireSellerStore } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { STATUS_BADGE } from "@/lib/order-status";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SellerOrderActions } from "@/components/seller/seller-order-actions";

export default async function SellerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gate = await requireSellerStore();
  if (!gate) return null;
  const locale = await getLocale();
  const t = await getTranslations("SellerOrders");
  const format = await getFormatter();

  const sub = await prisma.subOrder.findFirst({
    where: { id, storeId: gate.storeId },
    include: {
      items: true,
      order: {
        include: {
          address: true,
          buyer: { select: { name: true, phone: true } },
          history: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!sub) notFound();

  const money = (n: unknown) =>
    format.number(Number(n), { style: "currency", currency: "USD" });
  const total = Number(sub.itemsTotal) + Number(sub.shippingTotal);

  return (
    <div className="space-y-6">
      <Link
        href="/seller/orders"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("backToOrders")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            #{sub.order.id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-muted-foreground text-sm">
            {format.dateTime(sub.createdAt, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
        <span
          className={cn(
            "rounded px-2 py-1 text-sm font-medium",
            STATUS_BADGE[sub.status] ?? "bg-muted",
          )}
        >
          {t(`status_${sub.status}`)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SellerOrderActions subOrderId={sub.id} status={sub.status} />
        <Button asChild size="sm" variant="ghost">
          <a href={`/${locale}/packing-slip/${sub.id}`} target="_blank">
            <Printer className="size-4" /> {t("packingSlip")}
          </a>
        </Button>
      </div>

      {/* Items */}
      <section className="rounded-lg border">
        <div className="border-b px-4 py-2.5 text-sm font-medium">
          {t("items")}
        </div>
        <ul className="divide-y">
          {sub.items.map((it) => (
            <li key={it.id} className="flex justify-between gap-3 p-4 text-sm">
              <div className="min-w-0">
                <p className="line-clamp-2 font-medium">{it.titleSnapshot}</p>
                <p className="text-muted-foreground text-xs">
                  {it.skuSnapshot} · ×{it.quantity}
                </p>
              </div>
              <span className="font-medium" dir="ltr">
                {money(it.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("itemsTotal")}</span>
            <span dir="ltr">{money(sub.itemsTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("shipping")}</span>
            <span dir="ltr">{money(sub.shippingTotal)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>{t("total")}</span>
            <span dir="ltr">{money(total)}</span>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg border p-4 text-sm">
          <h3 className="mb-2 font-medium">{t("shipTo")}</h3>
          <p className="font-medium">{sub.order.address.fullName}</p>
          <p className="text-muted-foreground">{sub.order.address.phone}</p>
          <p className="text-muted-foreground">
            {sub.order.address.line1}
            {sub.order.address.line2
              ? `, ${sub.order.address.line2}`
              : ""}, {sub.order.address.city}, {sub.order.address.governorate}
          </p>
        </section>

        <section className="rounded-lg border p-4">
          <h3 className="mb-3 text-sm font-medium">{t("timeline")}</h3>
          <ol className="space-y-3">
            {sub.order.history.map((h) => (
              <li key={h.id} className="flex gap-3 text-sm">
                <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" />
                <span>
                  <span className="font-medium">{t(`status_${h.status}`)}</span>
                  {h.note ? (
                    <span className="text-muted-foreground"> — {h.note}</span>
                  ) : null}
                  <br />
                  <span className="text-muted-foreground text-xs">
                    {format.dateTime(h.createdAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
