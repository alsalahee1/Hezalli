import { getFormatter, getTranslations } from "next-intl/server";
import { Search } from "lucide-react";

import { requireSellerStore } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { SELLER_TABS, STATUS_BADGE, type SellerTab } from "@/lib/order-status";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TAB_STATUSES: Record<Exclude<SellerTab, "all">, string[]> = {
  new: ["PENDING", "CONFIRMED"],
  processing: ["PROCESSING"],
  shipped: ["SHIPPED", "DELIVERED"],
  completed: ["COMPLETED"],
  cancelled: ["CANCELLED", "RETURNED", "REFUNDED"],
};

export default async function SellerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const gate = await requireSellerStore();
  if (!gate) return null;
  const t = await getTranslations("SellerOrders");
  const format = await getFormatter();

  const sp = await searchParams;
  const tab = (SELLER_TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as SellerTab)
    : "all";
  const q = (sp.q ?? "").trim();

  const subs = await prisma.subOrder.findMany({
    where: {
      storeId: gate.storeId,
      ...(tab !== "all" ? { status: { in: TAB_STATUSES[tab] as never } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      itemsTotal: true,
      createdAt: true,
      order: { select: { id: true, buyer: { select: { name: true } } } },
      items: { select: { titleSnapshot: true, quantity: true } },
    },
  });

  const filtered = q
    ? subs.filter(
        (s) =>
          s.order.id.slice(-8).toUpperCase().includes(q.toUpperCase()) ||
          (s.order.buyer.name ?? "").toLowerCase().includes(q.toLowerCase()),
      )
    : subs;

  const money = (n: unknown) =>
    format.number(Number(n), { style: "currency", currency: "USD" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <form className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 my-auto ms-3 size-4" />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="bg-muted/40 w-64 ps-9"
          />
          {tab !== "all" ? (
            <input type="hidden" name="tab" value={tab} />
          ) : null}
        </form>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b">
        {SELLER_TABS.map((tk) => (
          <Link
            key={tk}
            href={tk === "all" ? "/seller/orders" : `/seller/orders?tab=${tk}`}
            className={cn(
              "flex min-h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap",
              tab === tk
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t(`tab_${tk}`)}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const itemCount = s.items.reduce((n, i) => n + i.quantity, 0);
            const daysWaiting = Math.floor(
              (Date.now() - new Date(s.createdAt).getTime()) / 86_400_000,
            );
            const awaiting = ["PENDING", "CONFIRMED", "PROCESSING"].includes(
              s.status,
            );
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    #{s.order.id.slice(-8).toUpperCase()}
                    <span
                      className={cn(
                        "ms-2 rounded px-1.5 py-0.5 text-xs font-medium",
                        STATUS_BADGE[s.status] ?? "bg-muted",
                      )}
                    >
                      {t(`status_${s.status}`)}
                    </span>
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {s.order.buyer.name} ·{" "}
                    {format.dateTime(s.createdAt, { dateStyle: "medium" })} ·{" "}
                    {t("itemCount", { count: itemCount })}
                    {awaiting && daysWaiting >= 1 ? (
                      <span className="ms-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600">
                        {t("daysWaiting", { count: daysWaiting })}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold" dir="ltr">
                    {money(s.itemsTotal)}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/seller/orders/${s.id}`}>{t("manage")}</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
