import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Barcode } from "@/components/orders/barcode";
import { PrintButton } from "@/components/orders/print-button";

export default async function ShippingLabelPage({
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
      store: {
        select: {
          name: true,
          seller: { select: { user: { select: { phone: true } } } },
        },
      },
      shipment: {
        select: { trackingNumber: true, carrier: { select: { name: true } } },
      },
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

  const t = await getTranslations("ShippingLabel");
  const format = await getFormatter();

  const orderRef = `#${sub.order.id.slice(-8).toUpperCase()}`;
  const tracking = sub.shipment?.trackingNumber?.trim() || "";
  // The barcode encodes the tracking number when present, otherwise the order
  // reference so the parcel always carries a scannable identifier.
  const barcodeValue = (tracking || sub.order.id.slice(-8)).toUpperCase();
  const totalQty = sub.items.reduce((n, it) => n + it.quantity, 0);

  return (
    <main className="mx-auto max-w-md px-6 py-8 text-sm">
      <div className="mb-4 flex items-start justify-between print:hidden">
        <h1 className="text-lg font-semibold tracking-tight">{t("title")}</h1>
        <PrintButton label={t("print")} />
      </div>

      {/* The label itself — a bordered card sized for a standard shipping label. */}
      <div className="rounded-lg border-2 border-black p-4">
        <div className="flex items-center justify-between border-b-2 border-black pb-2">
          <span className="text-xl font-bold tracking-tight">Hezalli</span>
          <span className="text-xs">{orderRef}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide">
              {t("from")}
            </p>
            <p className="font-medium">{sub.store.name}</p>
            {sub.store.seller?.user?.phone ? (
              <p className="text-xs">{sub.store.seller.user.phone}</p>
            ) : null}
          </div>

          <div className="border-t border-dashed pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide">
              {t("to")}
            </p>
            <p className="text-base font-semibold">
              {sub.order.address.fullName}
            </p>
            <p>{sub.order.address.phone}</p>
            <p>
              {sub.order.address.line1}
              {sub.order.address.line2 ? `, ${sub.order.address.line2}` : ""}
            </p>
            <p className="font-medium">
              {sub.order.address.city}, {sub.order.address.governorate}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t-2 border-black py-2 text-xs">
          <p>
            <span className="text-muted-foreground">{t("carrier")}: </span>
            {sub.shipment?.carrier?.name || "—"}
          </p>
          <p className="text-end">
            <span className="text-muted-foreground">{t("date")}: </span>
            {format.dateTime(sub.order.createdAt, { dateStyle: "medium" })}
          </p>
          <p>
            <span className="text-muted-foreground">{t("items")}: </span>
            {totalQty}
          </p>
          <p className="text-end">
            <span className="text-muted-foreground">{t("tracking")}: </span>
            {tracking || t("noTracking")}
          </p>
        </div>

        <div className="border-t-2 border-black pt-2">
          <Barcode value={barcodeValue} height={56} />
          <p className="text-center font-mono text-sm tracking-widest">
            {barcodeValue}
          </p>
        </div>
      </div>

      <p className="text-muted-foreground mt-4 text-center text-xs print:hidden">
        {t("footer")}
      </p>
    </main>
  );
}
