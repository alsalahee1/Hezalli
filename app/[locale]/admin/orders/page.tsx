import { getFormatter, getTranslations } from "next-intl/server";
import { Search } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { STATUS_BADGE } from "@/lib/order-status";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const t = await getTranslations("AdminOrders");
  const format = await getFormatter();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      grandTotal: true,
      createdAt: true,
      paymentMethod: true,
      buyer: { select: { name: true } },
    },
  });
  const filtered = q
    ? orders.filter(
        (o) =>
          o.id.slice(-8).toUpperCase().includes(q.toUpperCase()) ||
          (o.buyer.name ?? "").toLowerCase().includes(q.toLowerCase()),
      )
    : orders;

  const money = (n: unknown) =>
    format.number(Number(n), { style: "currency", currency: "USD" });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <form className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 my-auto ms-3 size-4" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="bg-muted/40 h-9 w-64 rounded-md border ps-9 pe-3 text-sm outline-none"
          />
        </form>
      </div>

      {filtered.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {filtered.map((o) => (
              <li key={o.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-sm font-medium">
                    #{o.id.slice(-8).toUpperCase()}
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
                      STATUS_BADGE[o.status] ?? "bg-muted",
                    )}
                  >
                    {t(`status_${o.status}`)}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      {t("buyer")}
                    </dt>
                    <dd>{o.buyer.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      {t("method")}
                    </dt>
                    <dd>{o.paymentMethod}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <span className="text-sm font-medium" dir="ltr">
                    {money(o.grandTotal)}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/orders/${o.id}`}>{t("view")}</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-2 text-start font-medium">
                    {t("order")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("buyer")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("method")}
                  </th>
                  <th className="px-3 py-2 text-start font-medium">
                    {t("statusCol")}
                  </th>
                  <th className="px-3 py-2 text-end font-medium">
                    {t("total")}
                  </th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="px-3 py-2 font-mono">
                      #{o.id.slice(-8).toUpperCase()}
                    </td>
                    <td className="px-3 py-2">{o.buyer.name}</td>
                    <td className="px-3 py-2">{o.paymentMethod}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs font-medium",
                          STATUS_BADGE[o.status] ?? "bg-muted",
                        )}
                      >
                        {t(`status_${o.status}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-end" dir="ltr">
                      {money(o.grandTotal)}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/orders/${o.id}`}>{t("view")}</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
