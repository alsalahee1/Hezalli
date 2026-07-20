import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { getSetting } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { getWalletId, getWalletStats, getWalletView } from "@/lib/wallet";
import { getWalletLimits } from "@/lib/wallet-limits";
import { abs } from "@/lib/seo";
import { WalletTopUpForm } from "@/components/wallet/wallet-topup-form";
import { WalletWithdrawForm } from "@/components/wallet/wallet-withdraw-form";
import { WalletSendForm } from "@/components/wallet/wallet-send-form";
import { WalletRequestForm } from "@/components/wallet/wallet-request-form";
import { WalletTabBar } from "@/components/wallet/wallet-tab-bar";
import { ReferralLink } from "@/components/account/referral-link";
import { QrCode } from "@/components/orders/qr-code";

export const dynamic = "force-dynamic";

// One-line summary of a saved payout destination for display.
function describeDestination(method: string, details: unknown): string {
  const d = (details ?? {}) as Record<string, string>;
  if (method === "bank")
    return `${d.bankName ?? ""} · ${d.accountNumber ?? ""}`.trim();
  if (method === "wallet")
    return `${d.provider ?? ""} · ${d.walletNumber ?? ""}`.trim();
  if (method === "usdt")
    return `${d.network ?? ""} · ${d.address ?? ""}`.trim();
  return "—";
}

// Map wallet entry types to a translation key for the history list.
const ENTRY_LABEL: Record<string, string> = {
  TOP_UP: "topUp",
  PAYMENT: "payment",
  REFUND: "refund",
  CASHBACK: "cashback",
  CASHOUT: "cashout",
  ADJUSTMENT: "adjustment",
  SELLER_EARNINGS: "sellerEarnings",
  TRANSFER_OUT: "transferOut",
  TRANSFER_IN: "transferIn",
};

export default async function WalletPage() {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/account/wallet`);
  }
  const t = await getTranslations("Wallet");
  const format = await getFormatter();

  const userId = session.user.id;
  const { balance, frozen, entries } = await getWalletView(userId);
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  // Top-up + cash-out controls and any in-flight requests.
  const walletId = await getWalletId(userId);
  const [
    limits,
    minPayout,
    p2pEnabled,
    stats,
    profile,
    pendingTopUps,
    pendingWithdrawals,
  ] = await Promise.all([
    getWalletLimits(userId),
    getSetting("min_payout_usd"),
    getSetting("wallet_p2p_enabled"),
    getWalletStats(userId),
    prisma.sellerProfile.findUnique({
      where: { userId },
      select: {
        kycStatus: true,
        payoutMethods: { where: { isDefault: true }, take: 1 },
      },
    }),
    prisma.walletTopUp.findMany({
      where: { walletId, status: "AWAITING_CONFIRMATION" },
      orderBy: { createdAt: "desc" },
      select: { id: true, amountUsd: true, method: true, createdAt: true },
    }),
    prisma.walletWithdrawal.findMany({
      where: { walletId, status: { in: ["REQUESTED", "APPROVED"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, amountUsd: true, method: true, createdAt: true },
    }),
  ]);

  // Cash-out is offered to VERIFIED users with a saved payout method and enough
  // balance (Step 19.4 — regulation-gated).
  const payoutMethod = profile?.payoutMethods[0];
  const verified = profile?.kycStatus === "VERIFIED";
  const canWithdraw =
    !frozen && verified && !!payoutMethod && balance >= minPayout;
  // P2P send: available to any signed-in user with funds once an admin has
  // enabled the (regulated) transfer feature. See docs/19-wallet-strategy.md §4.
  const canSend = !frozen && p2pEnabled && balance > 0;

  return (
    <div className="space-y-6">
      {/* Native-app wallet treatment on phones: this marker drives the CSS in
          globals.css that hides the storefront chrome (announcement, header,
          footer, account heading + nav) on mobile so the screen reads like a
          standalone mobile wallet. Desktop is unaffected. */}
      <div data-native-wallet hidden />

      <div className="from-primary/10 flex items-center gap-4 rounded-xl border bg-gradient-to-br to-transparent p-5">
        <Wallet className="text-primary size-8 shrink-0" />
        <div>
          <p className="text-muted-foreground text-sm">{t("balance")}</p>
          <p className="text-2xl font-semibold" dir="ltr">
            {money(balance)}
          </p>
          <p className="text-muted-foreground text-xs">{t("subtitle")}</p>
        </div>
      </div>

      {stats.totalIn > 0 || stats.totalOut > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">{t("totalIn")}</p>
            <p className="text-lg font-semibold text-emerald-600" dir="ltr">
              {money(stats.totalIn)}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground text-xs">{t("totalOut")}</p>
            <p className="text-lg font-semibold" dir="ltr">
              {money(stats.totalOut)}
            </p>
          </div>
        </div>
      ) : null}

      {frozen ? (
        <p className="border-destructive/40 text-destructive bg-destructive/5 rounded-lg border p-3 text-sm">
          {t("frozen")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <WalletTopUpForm min={limits.min} max={limits.max} />
          {canWithdraw && payoutMethod ? (
            <WalletWithdrawForm
              balance={balance}
              min={minPayout}
              destination={describeDestination(
                payoutMethod.kind,
                payoutMethod.details,
              )}
            />
          ) : null}
          {canSend ? <WalletSendForm balance={balance} /> : null}
          {p2pEnabled ? <WalletRequestForm /> : null}
        </div>
      )}

      {/* Desktop only: on phones the bottom bar's Scan button already shows the
          user's receive QR (its "My code" tab), so this is redundant there.
          Desktop has no bottom bar, so keep it. */}
      {p2pEnabled && !frozen ? (
        <details className="hidden rounded-lg border p-4 md:block">
          <summary className="cursor-pointer font-medium">
            {t("receiveTitle")}
          </summary>
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="rounded-lg border bg-white p-3">
              <QrCode value={abs(locale, `/pay/u/${userId}`)} size={200} />
            </div>
            <p className="text-muted-foreground max-w-xs text-center text-sm">
              {t("receiveHint")}
            </p>
            <div className="w-full">
              <ReferralLink
                url={abs(locale, `/pay/u/${userId}`)}
                copyLabel={t("copyLink")}
                copiedLabel={t("copied")}
              />
            </div>
          </div>
        </details>
      ) : null}

      {pendingTopUps.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-medium">{t("pendingTitle")}</h2>
          <ul className="divide-y rounded-lg border">
            {pendingTopUps.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium">{t(`method_${p.method}`)}</p>
                  <p className="text-muted-foreground text-xs">
                    {t("pendingNote")} ·{" "}
                    {format.dateTime(p.createdAt, { dateStyle: "medium" })}
                  </p>
                </div>
                <span className="font-semibold text-amber-600" dir="ltr">
                  {money(Number(p.amountUsd))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pendingWithdrawals.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-medium">{t("pendingWithdrawalsTitle")}</h2>
          <ul className="divide-y rounded-lg border">
            {pendingWithdrawals.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium">{t("cashout")}</p>
                  <p className="text-muted-foreground text-xs">
                    {t("pendingNote")} ·{" "}
                    {format.dateTime(p.createdAt, { dateStyle: "medium" })}
                  </p>
                </div>
                <span className="font-semibold text-amber-600" dir="ltr">
                  −{money(Number(p.amountUsd))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section id="wallet-history" className="scroll-mt-20 space-y-3">
        <h2 className="font-medium">{t("history")}</h2>
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {entries.map((e) => {
              const amount = Number(e.amountUsd);
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {t(ENTRY_LABEL[e.type] ?? "adjustment")}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {format.dateTime(e.createdAt, { dateStyle: "medium" })}
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

      {/* Wallet-focused bottom bar for phones — replaces the storefront's
          default tab bar while on this screen. The center Scan button (P2P only)
          pays a scanned code or shows the user's own code to get paid. */}
      <WalletTabBar
        canTopUp={!frozen}
        canSend={canSend}
        canScan={p2pEnabled && !frozen}
        myPayUrl={abs(locale, `/pay/u/${userId}`)}
        myQr={<QrCode value={abs(locale, `/pay/u/${userId}`)} size={220} />}
      />
    </div>
  );
}
