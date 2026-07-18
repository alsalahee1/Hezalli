import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { getWalletView } from "@/lib/wallet";

export const dynamic = "force-dynamic";

// Map wallet entry types to a translation key for the history list.
const ENTRY_LABEL: Record<string, string> = {
  TOP_UP: "topUp",
  PAYMENT: "payment",
  REFUND: "refund",
  CASHBACK: "cashback",
  CASHOUT: "cashout",
  ADJUSTMENT: "adjustment",
};

export default async function WalletPage() {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/account/wallet`);
  }
  const t = await getTranslations("Wallet");
  const format = await getFormatter();

  const { balance, frozen, entries } = await getWalletView(session.user.id);
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

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
