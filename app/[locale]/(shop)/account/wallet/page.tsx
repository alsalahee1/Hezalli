import { Suspense } from "react";
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
import { WalletDeepLink } from "@/components/wallet/wallet-deep-link";
import { BillPayForm } from "@/components/wallet/bill-pay-form";
import { ReferralLink } from "@/components/account/referral-link";
import { QrCode } from "@/components/orders/qr-code";
import { BILLERS, billerName } from "@/lib/wallet-billers";
import { walletHasPin } from "@/lib/wallet-pin";

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

export default async function WalletPage() {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/account/wallet`);
  }
  const t = await getTranslations("Wallet");
  const format = await getFormatter();

  const userId = session.user.id;
  // History moved to its own screen (/account/wallet/history); the overview
  // only needs the balance and frozen flag here.
  const { balance, frozen } = await getWalletView(userId, 0);
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  // Top-up + cash-out controls and any in-flight requests.
  const walletId = await getWalletId(userId);
  const [
    limits,
    minPayout,
    p2pEnabled,
    billsEnabled,
    stats,
    hasPin,
    passkeys,
    profile,
    pendingTopUps,
    pendingWithdrawals,
    pendingBills,
  ] = await Promise.all([
    getWalletLimits(userId),
    getSetting("min_payout_usd"),
    getSetting("wallet_p2p_enabled"),
    getSetting("wallet_bills_enabled"),
    getWalletStats(userId),
    walletHasPin(userId),
    prisma.walletCredential.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true },
    }),
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
    prisma.walletBillPayment.findMany({
      where: { walletId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        biller: true,
        account: true,
        amountUsd: true,
        createdAt: true,
      },
    }),
  ]);

  // Cash-out is offered to VERIFIED users with a saved payout method and enough
  // balance (Step 19.4 — regulation-gated).
  const payoutMethod = profile?.payoutMethods[0];
  const verified = profile?.kycStatus === "VERIFIED";
  const hasPasskey = passkeys.length > 0;
  const canWithdraw =
    !frozen && verified && !!payoutMethod && balance >= minPayout;
  // P2P send: available to any signed-in user with funds once an admin has
  // enabled the (regulated) transfer feature. See docs/19-wallet-strategy.md §4.
  const canSend = !frozen && p2pEnabled && balance > 0;
  // Bill payment / airtime: spend from the wallet once an admin enables the
  // (provider-ready) framework. See docs/19-wallet-strategy.md §5.
  const canPayBills = !frozen && billsEnabled && balance > 0;
  const billerOptions = BILLERS.map((b) => ({
    slug: b.slug,
    kind: b.kind,
    name: billerName(b.slug, locale),
  }));

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
              hasPin={hasPin}
              hasPasskey={hasPasskey}
            />
          ) : null}
          {canSend ? (
            <WalletSendForm
              balance={balance}
              hasPin={hasPin}
              hasPasskey={hasPasskey}
            />
          ) : null}
          {p2pEnabled ? <WalletRequestForm /> : null}
        </div>
      )}

      {canPayBills ? (
        <BillPayForm
          billers={billerOptions}
          balance={balance}
          hasPin={hasPin}
          hasPasskey={hasPasskey}
        />
      ) : null}

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

      {pendingBills.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-medium">{t("pendingBillsTitle")}</h2>
          <ul className="divide-y rounded-lg border">
            {pendingBills.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {t(
                      p.kind === "AIRTIME"
                        ? "airtimeEntry"
                        : "billPaymentEntry",
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {billerName(p.biller, locale)} ·{" "}
                    <span dir="ltr">{p.account}</span> · {t("pendingNote")}
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

      {/* Opens Top up / Send when arrived here via the sub-screen tabs. */}
      <Suspense fallback={null}>
        <WalletDeepLink />
      </Suspense>
    </div>
  );
}
