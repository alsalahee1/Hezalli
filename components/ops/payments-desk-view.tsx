import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import {
  PaymentQueue,
  type PaymentRow,
} from "@/components/admin/payment-queue";
import { TopUpQueue, type TopUpRow } from "@/components/admin/topup-queue";
import { BillQueue, type BillRow } from "@/components/admin/bill-queue";
import { billerName } from "@/lib/wallet-billers";
import { getLocale } from "next-intl/server";

export async function PaymentsDeskView() {
  const t = await getTranslations("AdminPayments");
  const format = await getFormatter();
  const locale = await getLocale();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [payments, topUps, bills] = await Promise.all([
    prisma.payment.findMany({
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
    }),
    prisma.walletTopUp.findMany({
      where: { status: "AWAITING_CONFIRMATION" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        method: true,
        amountUsd: true,
        reference: true,
        usdtNetwork: true,
        usdtTxHash: true,
        wallet: { select: { user: { select: { name: true } } } },
      },
    }),
    prisma.walletBillPayment.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        kind: true,
        biller: true,
        account: true,
        amountUsd: true,
        wallet: { select: { user: { select: { name: true } } } },
      },
    }),
  ]);

  const rows: PaymentRow[] = payments.map((p) => ({
    id: p.id,
    orderCode: p.order.id.slice(-8).toUpperCase(),
    buyerName: p.order.buyer.name ?? "—",
    method: p.method,
    amountLabel: money(Number(p.amountUsd)),
    reference: p.reference,
    usdt: p.usdtTxHash ? `${p.usdtNetwork ?? ""} ${p.usdtTxHash}`.trim() : null,
  }));

  const topUpRows: TopUpRow[] = topUps.map((p) => ({
    id: p.id,
    buyerName: p.wallet.user.name ?? "—",
    method: p.method,
    amountLabel: money(Number(p.amountUsd)),
    reference: p.reference,
    usdt: p.usdtTxHash ? `${p.usdtNetwork ?? ""} ${p.usdtTxHash}`.trim() : null,
  }));

  const billRows: BillRow[] = bills.map((b) => ({
    id: b.id,
    buyerName: b.wallet.user.name ?? "—",
    kind: b.kind,
    billerName: billerName(b.biller, locale),
    account: b.account,
    amountLabel: money(Number(b.amountUsd)),
  }));

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("desc")}</p>
        </div>
        <PaymentQueue rows={rows} />
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {t("topUpsTitle")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("topUpsDesc")}</p>
        </div>
        <TopUpQueue rows={topUpRows} />
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {t("billsTitle")}
          </h2>
          <p className="text-muted-foreground text-sm">{t("billsDesc")}</p>
        </div>
        <BillQueue rows={billRows} />
      </div>
    </div>
  );
}
