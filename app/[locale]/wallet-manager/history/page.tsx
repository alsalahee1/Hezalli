import { getFormatter, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: "text-emerald-600",
  PAID: "text-emerald-600",
  REJECTED: "text-destructive",
};

// Processed top-ups and withdrawals — the record the pending queues drop.
export default async function WalletManagerHistoryPage() {
  const t = await getTranslations("WalletManager");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [topUps, withdrawals] = await Promise.all([
    prisma.walletTopUp.findMany({
      where: { status: { in: ["CONFIRMED", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amountUsd: true,
        method: true,
        status: true,
        reviewedBy: true,
        reviewNote: true,
        createdAt: true,
        wallet: {
          select: { id: true, user: { select: { name: true } } },
        },
      },
    }),
    prisma.walletWithdrawal.findMany({
      where: { status: { in: ["PAID", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amountUsd: true,
        method: true,
        status: true,
        reviewedBy: true,
        reviewNote: true,
        processedAt: true,
        createdAt: true,
        wallet: {
          select: { id: true, user: { select: { name: true } } },
        },
      },
    }),
  ]);

  // Resolve reviewer ids → names in one query.
  const reviewerIds = [
    ...new Set(
      [...topUps, ...withdrawals]
        .map((r) => r.reviewedBy)
        .filter((v): v is string => !!v),
    ),
  ];
  const reviewers = reviewerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, name: true },
      })
    : [];
  const reviewerName = new Map(reviewers.map((u) => [u.id, u.name ?? "—"]));

  const section = (
    title: string,
    rows: {
      id: string;
      amountUsd: unknown;
      method: string;
      status: string;
      reviewedBy: string | null;
      reviewNote: string | null;
      createdAt: Date;
      wallet: { id: string; user: { name: string | null } };
    }[],
  ) => (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("none")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <Link
                  href={`/wallet-manager/wallets/${r.wallet.id}`}
                  className="font-medium hover:underline"
                >
                  {r.wallet.user.name ?? "—"}
                </Link>
                <p className="text-muted-foreground truncate text-xs">
                  {r.method} ·{" "}
                  {format.dateTime(r.createdAt, { dateStyle: "medium" })}
                  {r.reviewedBy
                    ? ` · ${t("reviewedBy")} ${reviewerName.get(r.reviewedBy) ?? "—"}`
                    : ""}
                  {r.reviewNote ? ` · ${r.reviewNote}` : ""}
                </p>
              </div>
              <div className="text-end">
                <p className="font-semibold" dir="ltr">
                  {money(Number(r.amountUsd))}
                </p>
                <p
                  className={`text-xs font-medium ${STATUS_TONE[r.status] ?? "text-muted-foreground"}`}
                >
                  {t(`status_${r.status}`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("history")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("historyDesc")}</p>
      </div>
      {section(t("processedTopUps"), topUps)}
      {section(t("processedWithdrawals"), withdrawals)}
    </div>
  );
}
