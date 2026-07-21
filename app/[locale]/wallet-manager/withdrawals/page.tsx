import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import {
  WithdrawalQueue,
  type WithdrawalRow,
} from "@/components/admin/withdrawal-queue";

export const dynamic = "force-dynamic";

function describe(method: string, details: unknown): string {
  const d = (details ?? {}) as Record<string, string>;
  if (method === "bank")
    return `${d.bankName ?? ""} · ${d.accountNumber ?? ""}`.trim();
  if (method === "wallet")
    return `${d.provider ?? ""} · ${d.walletNumber ?? ""}`.trim();
  if (method === "usdt")
    return `${d.network ?? ""} · ${d.address ?? ""}`.trim();
  return "—";
}

export default async function WalletManagerWithdrawalsPage() {
  const t = await getTranslations("WalletManager");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const withdrawals = await prisma.walletWithdrawal.findMany({
    where: { status: { in: ["REQUESTED", "APPROVED"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      amountUsd: true,
      method: true,
      destination: true,
      wallet: { select: { user: { select: { name: true } } } },
    },
  });

  const rows: WithdrawalRow[] = withdrawals.map((p) => ({
    id: p.id,
    buyerName: p.wallet.user.name ?? "—",
    amountLabel: money(Number(p.amountUsd)),
    method: p.method,
    destination: describe(p.method, p.destination),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("withdrawals")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("withdrawalsDesc")}</p>
      </div>
      <WithdrawalQueue rows={rows} />
    </div>
  );
}
