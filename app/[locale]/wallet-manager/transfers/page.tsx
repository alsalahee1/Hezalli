import { ArrowRight } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

// P2P money-transmission log. Every transfer is listed here for monitoring —
// P2P is regulation-gated (wallet_p2p_enabled, default off).
export default async function WalletManagerTransfersPage() {
  const t = await getTranslations("WalletManager");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [p2pEnabled, transfers] = await Promise.all([
    getSetting("wallet_p2p_enabled"),
    prisma.walletTransfer.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        amountUsd: true,
        note: true,
        createdAt: true,
        fromWallet: {
          select: { id: true, user: { select: { name: true, email: true } } },
        },
        toWallet: {
          select: { id: true, user: { select: { name: true, email: true } } },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("transfers")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("transfersDesc")} ·{" "}
          {p2pEnabled ? t("p2pEnabled") : t("p2pDisabled")}
        </p>
      </div>

      {transfers.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          {t("transfersEmpty")}
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {transfers.map((tr) => (
            <li
              key={tr.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  href={`/wallet-manager/wallets/${tr.fromWallet.id}`}
                  className="font-medium hover:underline"
                >
                  {tr.fromWallet.user.name ?? tr.fromWallet.user.email}
                </Link>
                <ArrowRight className="text-muted-foreground size-4 rtl:rotate-180" />
                <Link
                  href={`/wallet-manager/wallets/${tr.toWallet.id}`}
                  className="font-medium hover:underline"
                >
                  {tr.toWallet.user.name ?? tr.toWallet.user.email}
                </Link>
              </div>
              <div className="text-end">
                <p className="font-semibold" dir="ltr">
                  {money(Number(tr.amountUsd))}
                </p>
                <p className="text-muted-foreground text-xs">
                  {format.dateTime(tr.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {tr.note ? ` · ${tr.note}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
