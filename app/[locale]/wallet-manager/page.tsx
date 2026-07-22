import {
  ArrowLeftRight,
  Banknote,
  DollarSign,
  Snowflake,
  Users,
  Wallet,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

export default async function WalletManagerDashboardPage() {
  const t = await getTranslations("WalletManager");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [
    liability,
    walletCount,
    frozenCount,
    pendingTopUps,
    pendingCashouts,
    pendingPayouts,
  ] = await Promise.all([
    prisma.wallet.aggregate({ _sum: { availableUsd: true } }),
    prisma.wallet.count(),
    prisma.wallet.count({ where: { frozen: true } }),
    prisma.walletTopUp.aggregate({
      where: { status: "AWAITING_CONFIRMATION" },
      _count: true,
      _sum: { amountUsd: true },
    }),
    prisma.walletWithdrawal.aggregate({
      where: { status: { in: ["REQUESTED", "APPROVED"] } },
      _count: true,
      _sum: { amountUsd: true },
    }),
    prisma.payout.aggregate({
      where: { status: { in: ["REQUESTED", "APPROVED"] } },
      _count: true,
      _sum: { amountUsd: true },
    }),
  ]);

  const cards = [
    {
      key: "liability",
      value: money(Number(liability._sum.availableUsd ?? 0)),
      icon: DollarSign,
      href: "/wallet-manager/wallets",
    },
    {
      key: "wallets",
      value: String(walletCount),
      icon: Users,
      href: "/wallet-manager/wallets",
    },
    {
      key: "frozen",
      value: String(frozenCount),
      icon: Snowflake,
      href: "/wallet-manager/wallets?frozen=1",
    },
    {
      key: "pendingTopUps",
      value: String(pendingTopUps._count),
      icon: Banknote,
      hint: money(Number(pendingTopUps._sum.amountUsd ?? 0)),
      href: "/wallet-manager/topups",
    },
    {
      key: "pendingWithdrawals",
      value: String(pendingCashouts._count),
      icon: ArrowLeftRight,
      hint: money(Number(pendingCashouts._sum.amountUsd ?? 0)),
      href: "/wallet-manager/withdrawals",
    },
    {
      key: "pendingPayouts",
      value: String(pendingPayouts._count),
      icon: Banknote,
      hint: money(Number(pendingPayouts._sum.amountUsd ?? 0)),
      href: "/wallet-manager/payouts",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="text-primary size-6" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.key} href={c.href} className="block">
              <div className="bg-card hover:bg-muted/50 rounded-lg border p-4 transition-colors">
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Icon className="size-4" /> {t(c.key)}
                </div>
                <p className="mt-1 text-2xl font-semibold" dir="ltr">
                  {c.value}
                </p>
                {c.hint ? (
                  <p className="text-muted-foreground mt-0.5 text-xs" dir="ltr">
                    {c.hint}
                  </p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
