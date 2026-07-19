import { getFormatter, getTranslations } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { recomputeBalance } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { RequestPayoutButton } from "@/components/seller/request-payout-button";
import { MoveToWalletButton } from "@/components/seller/move-to-wallet-button";

const PAYOUT_BADGE: Record<string, string> = {
  REQUESTED: "bg-amber-500/15 text-amber-600",
  APPROVED: "bg-blue-500/15 text-blue-600",
  PAID: "bg-emerald-500/15 text-emerald-600",
  REJECTED: "bg-destructive/10 text-destructive",
};

export default async function SellerFinancePage() {
  const gate = await requireSellerStore();
  if (!gate) return null;
  const t = await getTranslations("SellerFinance");
  const format = await getFormatter();

  const store = await prisma.store.findUnique({
    where: { id: gate.storeId },
    select: { sellerId: true },
  });
  if (!store) return null;
  await recomputeBalance(store.sellerId);

  const [balance, payouts, method] = await Promise.all([
    prisma.sellerBalance.findUnique({
      where: { sellerId: store.sellerId },
      include: { entries: { orderBy: { createdAt: "desc" }, take: 100 } },
    }),
    prisma.payout.findMany({
      where: { sellerId: store.sellerId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.payoutMethod.findFirst({
      where: { sellerId: store.sellerId, isDefault: true },
      select: { id: true },
    }),
  ]);

  const money = (n: unknown) =>
    format.number(Number(n), { style: "currency", currency: "USD" });
  const available = Number(balance?.availableUsd ?? 0);
  const pending = Number(balance?.pendingUsd ?? 0);
  const outstanding = payouts
    .filter((p) => p.status === "REQUESTED" || p.status === "APPROVED")
    .reduce((s, p) => s + Number(p.amountUsd), 0);
  const free = available - outstanding;
  const canRequest = Boolean(method) && free >= 10;
  const canMove = free > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">{t("available")}</p>
          <p
            className={`text-2xl font-bold ${available < 0 ? "text-destructive" : ""}`}
            dir="ltr"
          >
            {money(available)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("availableHint")}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">{t("pending")}</p>
          <p className="text-2xl font-bold" dir="ltr">
            {money(pending)}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("pendingHint")}
          </p>
        </div>
      </div>

      {/* Payouts */}
      <div className="rounded-lg border p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t("payouts")}</h2>
          <div className="flex flex-wrap items-start gap-2">
            <MoveToWalletButton disabled={!canMove} />
            <RequestPayoutButton disabled={!canRequest} />
          </div>
        </div>
        {!method ? (
          <p className="text-muted-foreground text-sm">
            {t("noMethodHint")}{" "}
            <Link
              href="/seller/settings"
              className="text-primary hover:underline"
            >
              {t("setUpPayout")}
            </Link>
          </p>
        ) : null}
        {payouts.length > 0 ? (
          <ul className="divide-y text-sm">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span>
                  {format.dateTime(p.createdAt, { dateStyle: "medium" })} ·{" "}
                  {p.method}
                </span>
                <span className="flex items-center gap-2">
                  <span dir="ltr">{money(p.amountUsd)}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium",
                      PAYOUT_BADGE[p.status] ?? "bg-muted",
                    )}
                  >
                    {t(`payout_${p.status}`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t("noPayouts")}</p>
        )}
      </div>

      <div>
        <h2 className="mb-3 font-semibold">{t("ledger")}</h2>
        {balance && balance.entries.length > 0 ? (
          <>
            <ul className="space-y-3 md:hidden">
              {balance.entries.map((e) => {
                const amt = Number(e.amountUsd);
                return (
                  <li key={e.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{t(`type_${e.type}`)}</p>
                        <p className="text-muted-foreground text-xs whitespace-nowrap">
                          {format.dateTime(e.createdAt, {
                            dateStyle: "medium",
                          })}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-medium ${amt < 0 ? "text-destructive" : "text-emerald-600"}`}
                        dir="ltr"
                      >
                        {amt >= 0 ? "+" : ""}
                        {money(amt)}
                      </span>
                    </div>
                    {e.note ? (
                      <p className="text-muted-foreground mt-1 text-xs break-words">
                        {e.note}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="hidden overflow-x-auto rounded-lg border md:block">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-3 py-2 text-start font-medium">
                      {t("date")}
                    </th>
                    <th className="px-3 py-2 text-start font-medium">
                      {t("type")}
                    </th>
                    <th className="px-3 py-2 text-start font-medium">
                      {t("note")}
                    </th>
                    <th className="px-3 py-2 text-end font-medium">
                      {t("amount")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {balance.entries.map((e) => {
                    const amt = Number(e.amountUsd);
                    return (
                      <tr key={e.id} className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {format.dateTime(e.createdAt, {
                            dateStyle: "medium",
                          })}
                        </td>
                        <td className="px-3 py-2">{t(`type_${e.type}`)}</td>
                        <td className="text-muted-foreground px-3 py-2">
                          {e.note}
                        </td>
                        <td
                          className={`px-3 py-2 text-end font-medium ${amt < 0 ? "text-destructive" : "text-emerald-600"}`}
                          dir="ltr"
                        >
                          {amt >= 0 ? "+" : ""}
                          {money(amt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
            {t("empty")}
          </div>
        )}
      </div>
    </div>
  );
}
