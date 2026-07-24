import { getFormatter, getTranslations } from "next-intl/server";
import { ReceiptText } from "lucide-react";

import { requireMerchant } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

// The merchant's full payment history — every customer payment received,
// newest first. Money settles into the owner's HezalliPay wallet; this is the
// business-facing view of it.
export default async function MerchantTransactionsPage() {
  const gate = await requireMerchant();
  if (!gate) return null;
  const t = await getTranslations("Merchant");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const payments = await prisma.merchantPayment.findMany({
    where: { merchantId: gate.merchantId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      amountUsd: true,
      note: true,
      createdAt: true,
      payer: { select: { name: true, email: true } },
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{t("txTitle")}</h1>

      {payments.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
          <ReceiptText className="mx-auto mb-2 size-8 opacity-50" />
          {t("noPayments")}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {payments.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 px-3 py-3 text-sm"
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
    </div>
  );
}
