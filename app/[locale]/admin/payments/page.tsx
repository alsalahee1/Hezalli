import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import {
  PaymentQueue,
  type PaymentRow,
} from "@/components/admin/payment-queue";

export default async function AdminPaymentsPage() {
  const t = await getTranslations("AdminPayments");
  const format = await getFormatter();

  const payments = await prisma.payment.findMany({
    where: { status: "AWAITING_CONFIRMATION" },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      method: true,
      amountUsd: true,
      reference: true,
      usdtNetwork: true,
      usdtTxHash: true,
      order: {
        select: { id: true, buyer: { select: { name: true } } },
      },
    },
  });

  const rows: PaymentRow[] = payments.map((p) => ({
    id: p.id,
    orderCode: p.order.id.slice(-8).toUpperCase(),
    buyerName: p.order.buyer.name ?? "—",
    method: p.method,
    amountLabel: format.number(Number(p.amountUsd), {
      style: "currency",
      currency: "USD",
    }),
    reference: p.reference,
    usdt: p.usdtTxHash ? `${p.usdtNetwork ?? ""} ${p.usdtTxHash}`.trim() : null,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <PaymentQueue rows={rows} />
    </div>
  );
}
