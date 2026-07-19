import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { DownloadPdfButton } from "@/components/orders/download-pdf-button";
import { PrintButton } from "@/components/orders/print-button";

export default async function PackingSlipPage({
  params,
}: {
  params: Promise<{ subOrderId: string }>;
}) {
  const { subOrderId } = await params;
  const gate = await requireSellerStore();
  if (!gate) notFound();

  const sub = await prisma.subOrder.findFirst({
    where: { id: subOrderId, storeId: gate.storeId },
    include: {
      items: true,
      store: { select: { name: true } },
      order: {
        select: {
          id: true,
          createdAt: true,
          address: true,
          buyer: { select: { name: true } },
        },
      },
    },
  });
  if (!sub) notFound();

  const t = await getTranslations("PackingSlip");
  const format = await getFormatter();
  const locale = await getLocale();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 text-sm">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{sub.store.name}</h1>
          <p className="text-muted-foreground">{t("packingSlip")}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <DownloadPdfButton
            type="packing-slip"
            id={sub.id}
            locale={locale}
            label={t("downloadPdf")}
          />
          <PrintButton label={t("print")} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <p className="text-muted-foreground">{t("shipTo")}</p>
          <p className="font-medium">{sub.order.address.fullName}</p>
          <p>{sub.order.address.phone}</p>
          <p>
            {sub.order.address.line1}
            {sub.order.address.line2 ? `, ${sub.order.address.line2}` : ""}
          </p>
          <p>
            {sub.order.address.city}, {sub.order.address.governorate}
          </p>
        </div>
        <div className="text-end">
          <p>
            <span className="text-muted-foreground">{t("orderNumber")}: </span>#
            {sub.order.id.slice(-8).toUpperCase()}
          </p>
          <p>
            <span className="text-muted-foreground">{t("date")}: </span>
            {format.dateTime(sub.order.createdAt, { dateStyle: "medium" })}
          </p>
        </div>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y">
            <th className="py-2 text-start font-medium">{t("item")}</th>
            <th className="py-2 text-start font-medium">{t("sku")}</th>
            <th className="py-2 text-end font-medium">{t("qty")}</th>
          </tr>
        </thead>
        <tbody>
          {sub.items.map((it) => (
            <tr key={it.id} className="border-b">
              <td className="py-2">{it.titleSnapshot}</td>
              <td className="text-muted-foreground py-2">{it.skuSnapshot}</td>
              <td className="py-2 text-end font-medium">{it.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-muted-foreground mt-10 text-center text-xs">
        {t("footer")}
      </p>
    </main>
  );
}
