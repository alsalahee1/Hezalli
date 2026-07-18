import { getFormatter, getTranslations } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { recomputeBalance } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

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

  const balance = await prisma.sellerBalance.findUnique({
    where: { sellerId: store.sellerId },
    include: { entries: { orderBy: { createdAt: "desc" }, take: 100 } },
  });

  const money = (n: unknown) =>
    format.number(Number(n), { style: "currency", currency: "USD" });
  const available = Number(balance?.availableUsd ?? 0);
  const pending = Number(balance?.pendingUsd ?? 0);

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

      <div>
        <h2 className="mb-3 font-semibold">{t("ledger")}</h2>
        {balance && balance.entries.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
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
                        {format.dateTime(e.createdAt, { dateStyle: "medium" })}
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
        ) : (
          <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
            {t("empty")}
          </div>
        )}
      </div>
    </div>
  );
}
