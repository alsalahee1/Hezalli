import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { PayoutQueue, type PayoutRow } from "@/components/admin/payout-queue";

function describe(method: string, details: unknown): string {
  const d = (details ?? {}) as Record<string, string>;
  if (method === "bank")
    return `${d.bankName ?? ""} · ${d.accountNumber ?? ""}`.trim();
  if (method === "wallet")
    return `${d.provider ?? ""} · ${d.walletNumber ?? ""}`.trim();
  if (method === "usdt")
    return `${d.network ?? ""} · ${d.address ?? ""}`.trim();
  return "—";
}

export default async function AdminPayoutsPage() {
  const t = await getTranslations("AdminPayouts");
  const format = await getFormatter();

  const payouts = await prisma.payout.findMany({
    where: { status: { in: ["REQUESTED", "APPROVED"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      amountUsd: true,
      method: true,
      destination: true,
      seller: { select: { user: { select: { name: true } } } },
    },
  });

  const rows: PayoutRow[] = payouts.map((p) => ({
    id: p.id,
    sellerName: p.seller.user.name ?? "—",
    amountLabel: format.number(Number(p.amountUsd), {
      style: "currency",
      currency: "USD",
    }),
    method: p.method,
    destination: describe(p.method, p.destination),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <PayoutQueue rows={rows} />
    </div>
  );
}
