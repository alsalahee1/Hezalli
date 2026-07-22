import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { TopUpQueue, type TopUpRow } from "@/components/admin/topup-queue";

export const dynamic = "force-dynamic";

export default async function WalletManagerTopUpsPage() {
  const t = await getTranslations("WalletManager");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const topUps = await prisma.walletTopUp.findMany({
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
  });

  const rows: TopUpRow[] = topUps.map((p) => ({
    id: p.id,
    buyerName: p.wallet.user.name ?? "—",
    method: p.method,
    amountLabel: money(Number(p.amountUsd)),
    reference: p.reference,
    usdt: p.usdtTxHash ? `${p.usdtNetwork ?? ""} ${p.usdtTxHash}`.trim() : null,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("topups")}</h1>
        <p className="text-muted-foreground text-sm">{t("topupsDesc")}</p>
      </div>
      <TopUpQueue rows={rows} />
    </div>
  );
}
