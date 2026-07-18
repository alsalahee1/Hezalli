import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { getSetting } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { getWalletId, getWalletView } from "@/lib/wallet";
import { getWalletLimits } from "@/lib/wallet-limits";
import { WalletTopUpForm } from "@/components/wallet/wallet-topup-form";
import { WalletWithdrawForm } from "@/components/wallet/wallet-withdraw-form";

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
  const [limits, minPayout, profile, pendingTopUps, pendingWithdrawals] =
    await Promise.all([
      getWalletLimits(userId),
      getSetting("min_payout_usd"),
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
  const canWithdraw =
    !frozen &&
    profile?.kycStatus === "VERIFIED" &&
    !!payoutMethod &&
    balance >= minPayout;

  return (
    <div className="space-y-6">
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
        </div>
      )}

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

      <section className="space-y-3">
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
    </div>
  );
}
