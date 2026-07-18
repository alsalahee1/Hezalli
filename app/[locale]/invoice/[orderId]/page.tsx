import { notFound, redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/orders/print-button";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) redirect(`/${locale}/login`);

  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: session.user.id },
    include: {
      address: true,
      payment: true,
      buyer: { select: { name: true, email: true } },
      subOrders: {
        include: { store: { select: { name: true } }, items: true },
      },
    },
  });
  if (!order) notFound();

  const t = await getTranslations("Invoice");
  const format = await getFormatter();
  const money = (n: unknown) =>
    format.number(Number(n), { style: "currency", currency: "USD" });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-sm">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hezalli</h1>
          <p className="text-muted-foreground">{t("invoice")}</p>
        </div>
        <PrintButton label={t("print")} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <p className="text-muted-foreground">{t("billTo")}</p>
          <p className="font-medium">{order.address.fullName}</p>
          <p>{order.address.phone}</p>
          <p>
            {order.address.line1}
            {order.address.line2 ? `, ${order.address.line2}` : ""}
          </p>
          <p>
            {order.address.city}, {order.address.governorate}
          </p>
        </div>
        <div className="text-end">
          <p>
            <span className="text-muted-foreground">{t("orderNumber")}: </span>#
            {order.id.slice(-8).toUpperCase()}
          </p>
          <p>
            <span className="text-muted-foreground">{t("date")}: </span>
            {format.dateTime(order.createdAt, { dateStyle: "medium" })}
          </p>
          <p>
            <span className="text-muted-foreground">{t("payment")}: </span>
            {order.paymentMethod}
          </p>
        </div>
      </div>

      <table className="w-full border-collapse text-start">
        <thead>
          <tr className="border-y">
            <th className="py-2 text-start font-medium">{t("item")}</th>
            <th className="py-2 text-end font-medium">{t("qty")}</th>
            <th className="py-2 text-end font-medium">{t("price")}</th>
            <th className="py-2 text-end font-medium">{t("lineTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {order.subOrders.map((s) =>
            s.items.map((it) => (
              <tr key={it.id} className="border-b">
                <td className="py-2">
                  {it.titleSnapshot}
                  <span className="text-muted-foreground block text-xs">
                    {s.store.name} · {it.skuSnapshot}
                  </span>
                </td>
                <td className="py-2 text-end">{it.quantity}</td>
                <td className="py-2 text-end" dir="ltr">
                  {money(it.unitPrice)}
                </td>
                <td className="py-2 text-end" dir="ltr">
                  {money(it.lineTotal)}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>

      <div className="ms-auto mt-4 w-56 space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("itemsTotal")}</span>
          <span dir="ltr">{money(order.itemsTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("shipping")}</span>
          <span dir="ltr">{money(order.shippingTotal)}</span>
        </div>
        {Number(order.discountTotal) > 0 ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("discount")}</span>
            <span dir="ltr">-{money(order.discountTotal)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <span>{t("total")}</span>
          <span dir="ltr">{money(order.grandTotal)}</span>
        </div>
      </div>

      <p className="text-muted-foreground mt-10 text-center text-xs">
        {t("footer")}
      </p>
    </main>
  );
}
