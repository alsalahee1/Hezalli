import { notFound } from "next/navigation";
import { ArrowLeft, Snowflake } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { WalletTools } from "@/components/wallet-manager/wallet-tools";

export const dynamic = "force-dynamic";

// Mirrors the buyer wallet page's entry labels (Wallet namespace).
const ENTRY_LABEL: Record<string, string> = {
  TOP_UP: "topUp",
  PAYMENT: "payment",
  REFUND: "refund",
  CASHBACK: "cashback",
  CASHOUT: "cashout",
  ADJUSTMENT: "adjustment",
  SELLER_EARNINGS: "sellerEarnings",
  COURIER_EARNINGS: "courierEarnings",
  POINT_EARNINGS: "pointEarnings",
  TRANSFER_OUT: "transferOut",
  TRANSFER_IN: "transferIn",
  BILL_PAYMENT: "billPaymentEntry",
  AIRTIME_TOPUP: "airtimeEntry",
  BILL_REFUND: "billRefundEntry",
};

export default async function WalletManagerWalletDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("WalletManager");
  const tw = await getTranslations("Wallet");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const wallet = await prisma.wallet.findUnique({
    where: { id },
    select: {
      id: true,
      availableUsd: true,
      frozen: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
      entries: { orderBy: { createdAt: "desc" }, take: 100 },
      topUps: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          amountUsd: true,
          method: true,
          status: true,
          createdAt: true,
        },
      },
      withdrawals: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          amountUsd: true,
          method: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });
  if (!wallet) notFound();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/wallet-manager/wallets"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" /> {t("backToWallets")}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {wallet.user.name ?? "—"}
              {wallet.frozen ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-600">
                  <Snowflake className="size-3" /> {t("frozenBadge")}
                </span>
              ) : null}
            </h1>
            <p className="text-muted-foreground text-sm">{wallet.user.email}</p>
          </div>
          <div className="text-end">
            <p className="text-muted-foreground text-xs">{t("balance")}</p>
            <p className="text-2xl font-semibold" dir="ltr">
              {money(Number(wallet.availableUsd))}
            </p>
          </div>
        </div>
      </div>

      <WalletTools userId={wallet.user.id} frozen={wallet.frozen} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="font-medium">{t("recentTopUps")}</h2>
          {wallet.topUps.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("none")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {wallet.topUps.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-medium">{p.method}</p>
                    <p className="text-muted-foreground text-xs">
                      {t(`status_${p.status}`)} ·{" "}
                      {format.dateTime(p.createdAt, { dateStyle: "medium" })}
                    </p>
                  </div>
                  <span className="font-semibold" dir="ltr">
                    {money(Number(p.amountUsd))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">{t("recentWithdrawals")}</h2>
          {wallet.withdrawals.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("none")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {wallet.withdrawals.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-medium">{p.method}</p>
                    <p className="text-muted-foreground text-xs">
                      {t(`status_${p.status}`)} ·{" "}
                      {format.dateTime(p.createdAt, { dateStyle: "medium" })}
                    </p>
                  </div>
                  <span className="font-semibold" dir="ltr">
                    −{money(Number(p.amountUsd))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t("ledger")}</h2>
          <a
            href={`/api/wallet-manager/export?wallet=${wallet.id}`}
            className="text-primary text-sm font-medium hover:underline"
            download
          >
            {t("exportCsv")}
          </a>
        </div>
        {wallet.entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("none")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {wallet.entries.map((e) => {
              const amount = Number(e.amountUsd);
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {tw(ENTRY_LABEL[e.type] ?? "adjustment")}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {format.dateTime(e.createdAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {e.note ? ` · ${e.note}` : ""}
                    </p>
                  </div>
                  <span
                    className={
                      amount >= 0
                        ? "font-semibold text-emerald-600"
                        : "text-destructive font-semibold"
                    }
                    dir="ltr"
                  >
                    {amount >= 0 ? "+" : "−"}
                    {money(Math.abs(amount))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
