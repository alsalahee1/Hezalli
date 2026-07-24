import { getFormatter, getTranslations } from "next-intl/server";
import { QrCode, ReceiptText, TrendingUp, Wallet } from "lucide-react";

import { requireMerchant } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getWalletView } from "@/lib/wallet";
import { Link } from "@/i18n/navigation";

// The merchant's home: today's takings, all-time totals, the wallet balance
// their payments settle into, and the latest transactions. A quiet, glanceable
// counter screen — the "charge" action is the raised center tab.
export default async function MerchantHomePage() {
  const gate = await requireMerchant();
  if (!gate) return null;
  const t = await getTranslations("Merchant");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [today, allTime, wallet, recent] = await Promise.all([
    prisma.merchantPayment.aggregate({
      where: { merchantId: gate.merchantId, createdAt: { gte: startOfDay } },
      _sum: { amountUsd: true },
      _count: { _all: true },
    }),
    prisma.merchantPayment.aggregate({
      where: { merchantId: gate.merchantId },
      _sum: { amountUsd: true },
      _count: { _all: true },
    }),
    getWalletView(gate.userId, 0),
    prisma.merchantPayment.findMany({
      where: { merchantId: gate.merchantId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        amountUsd: true,
        note: true,
        createdAt: true,
        payer: { select: { name: true, email: true } },
      },
    }),
  ]);

  const todayTotal = Number(today._sum.amountUsd ?? 0);
  const allTimeTotal = Number(allTime._sum.amountUsd ?? 0);

  return (
    <div className="space-y-5">
      {/* Takings summary */}
      <section className="space-y-2">
        <h1 className="text-lg font-semibold">{t("homeTitle")}</h1>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-4">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <TrendingUp className="size-3.5" /> {t("todayTakings")}
            </p>
            <p className="mt-1 text-2xl font-bold" dir="ltr">
              {money(todayTotal)}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("paymentsCount", { count: today._count._all })}
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <Wallet className="size-3.5" /> {t("walletBalance")}
            </p>
            <p className="mt-1 text-2xl font-bold" dir="ltr">
              {money(wallet.balance)}
            </p>
            <Link
              href="/account/wallet"
              className="text-primary text-xs hover:underline"
            >
              {t("openWallet")}
            </Link>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          {t("allTimeSummary", {
            total: money(allTimeTotal),
            count: allTime._count._all,
          })}
        </p>
      </section>

      {/* Primary actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/merchant/charge"
          className="bg-primary text-primary-foreground flex flex-col items-center gap-1 rounded-xl p-4 text-center text-sm font-semibold shadow-sm"
        >
          <QrCode className="size-6" />
          {t("chargeCta")}
        </Link>
        <Link
          href="/merchant/qr"
          className="hover:bg-muted/40 flex flex-col items-center gap-1 rounded-xl border p-4 text-center text-sm font-semibold transition-colors"
        >
          <QrCode className="size-6" />
          {t("storeQrCta")}
        </Link>
      </div>

      {/* Recent transactions */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-sm font-semibold">
            {t("recentTitle")}
          </h2>
          <Link
            href="/merchant/transactions"
            className="text-primary text-xs hover:underline"
          >
            {t("seeAll")}
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
            <ReceiptText className="mx-auto mb-2 size-8 opacity-50" />
            {t("noPayments")}
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {recent.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {p.payer.name || p.payer.email || t("customer")}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {format.dateTime(p.createdAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
                <span className="font-semibold text-emerald-600" dir="ltr">
                  +{money(Number(p.amountUsd))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
