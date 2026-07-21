import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { Link } from "@/i18n/navigation";
import { abs } from "@/lib/seo";
import { getSetting } from "@/lib/settings";
import { getWalletView } from "@/lib/wallet";
import { QrCode } from "@/components/orders/qr-code";
import { WalletTabBar } from "@/components/wallet/wallet-tab-bar";

export const dynamic = "force-dynamic";

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
  BILL_PAYMENT: "billPaymentEntry",
  AIRTIME_TOPUP: "airtimeEntry",
  BILL_REFUND: "billRefundEntry",
};

export default async function WalletHistoryPage() {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/account/wallet/history`);
  }
  const userId = session.user.id;
  const t = await getTranslations("Wallet");
  const format = await getFormatter();
  const [{ balance, frozen, entries }, p2pEnabled] = await Promise.all([
    getWalletView(userId, 200),
    getSetting("wallet_p2p_enabled"),
  ]);
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const myPayUrl = abs(locale, `/pay/u/${userId}`);

  return (
    <div className="mx-auto max-w-md space-y-5 pb-24">
      {/* Native-app wallet treatment on phones: hides the storefront chrome so
          the history reads like a standalone wallet screen. */}
      <div data-native-wallet hidden />

      <Link
        href="/account/wallet"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t("backToWallet")}
      </Link>

      <h1 className="text-xl font-semibold tracking-tight">{t("history")}</h1>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {entries.map((e) => {
            const amount = Number(e.amountUsd);
            return (
              <li key={e.id}>
                <Link
                  href={`/account/wallet/tx/${e.id}`}
                  className="hover:bg-muted/40 flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors"
                >
                  <div>
                    <p className="font-medium">
                      {t(ENTRY_LABEL[e.type] ?? "adjustment")}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {format.dateTime(e.createdAt, { dateStyle: "medium" })}
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5">
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
                    <ChevronRight className="text-muted-foreground size-4 rtl:rotate-180" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Same wallet bottom bar as the overview, so navigation stays consistent
          when drilling into history. History is the active tab. */}
      <WalletTabBar
        variant="sub"
        canTopUp={!frozen}
        canSend={!frozen && p2pEnabled && balance > 0}
        canScan={p2pEnabled && !frozen}
        myPayUrl={myPayUrl}
        myQr={<QrCode value={myPayUrl} size={220} />}
      />
    </div>
  );
}
