import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { FileText, Wallet } from "lucide-react";

import { Link, redirect } from "@/i18n/navigation";

import { requireDeliveryPoint } from "@/lib/authz";
import { canMoveEarnings, canViewMoney } from "@/lib/point-access";
import { pointLedgerSummary } from "@/lib/point-ledger";
import { transferPointEarningsToWallet } from "@/lib/actions/earnings-wallet";
import { prisma } from "@/lib/prisma";
import { DriverCashInForm } from "@/components/point/driver-cash-in-form";
import { PayoutRequestForm } from "@/components/point/payout-request-form";
import { RemitClaimForm } from "@/components/ops/remit-claim-form";
import { MoveEarningsToWallet } from "@/components/wallet/move-earnings-to-wallet";

const PAGE_SIZE = 50;

// The operator's earnings: handling fees accrued, payouts received, the
// balance Hezalli still owes them — and a request-payout flow (docs §22).
export default async function PointLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  // Money view: hidden from cashiers/organizers (docs §42d).
  if (!canViewMoney(gate.access)) {
    redirect({ href: "/point", locale: await getLocale() });
  }
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const t = await getTranslations("Point");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [summary, entryRows, couriers, payoutRequests, pendingClaim] =
    await Promise.all([
      pointLedgerSummary(gate.pointId),
      // One row past the page so "older entries" only shows when it has some.
      prisma.deliveryPointLedgerEntry.findMany({
        where: { pointId: gate.pointId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE + 1,
        select: {
          id: true,
          type: true,
          amountUsd: true,
          note: true,
          createdAt: true,
        },
      }),
      prisma.user.findMany({
        where: {
          roles: { has: "COURIER" },
          isSuspended: false,
          deletedAt: null,
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      }),
      prisma.pointPayoutRequest.findMany({
        where: { pointId: gate.pointId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          amountUsd: true,
          status: true,
          note: true,
          createdAt: true,
        },
      }),
      prisma.remitClaim.findFirst({
        where: { pointId: gate.pointId, status: "PENDING" },
        select: { amountUsd: true, method: true, reference: true },
      }),
    ]);
  const hasMore = entryRows.length > PAGE_SIZE;
  const entries = entryRows.slice(0, PAGE_SIZE);
  const hasOpen = payoutRequests.some(
    (r) => r.status === "REQUESTED" || r.status === "APPROVED",
  );
  // Each courier's current cash-on-hand (collected − remitted ± adjustments),
  // in one grouped query, so the cash-in form can offer "collect all".
  const courierIds = couriers.map((c) => c.id);
  const balanceRows = courierIds.length
    ? await prisma.courierLedgerEntry.groupBy({
        by: ["courierId"],
        where: {
          courierId: { in: courierIds },
          type: { in: ["COD_COLLECTED", "REMITTANCE", "ADJUSTMENT"] },
        },
        _sum: { amountUsd: true },
      })
    : [];
  const cashByDriver = new Map(
    balanceRows.map((r) => [r.courierId, Number(r._sum.amountUsd ?? 0)]),
  );
  const drivers = couriers.map((c) => ({
    id: c.id,
    name: c.name ?? c.email ?? c.id.slice(-6),
    cashOnHand: Math.max(
      0,
      Math.round((cashByDriver.get(c.id) ?? 0) * 100) / 100,
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{t("ledgerTitle")}</h1>
          <p className="text-muted-foreground text-sm">{t("ledgerSubtitle")}</p>
        </div>
        <Link
          href="/point/statement"
          className="text-primary inline-flex shrink-0 items-center gap-1 text-sm font-medium hover:underline"
        >
          <FileText className="size-4" /> {t("stmtLink")}
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-500">
            <Wallet className="size-3.5" /> {t("balance")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {money(summary.balance)}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            {t("totalFees")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {money(summary.totalFees)}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            {t("totalPaidOut")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {money(summary.totalPaidOut)}
          </p>
        </div>
      </div>

      {/* Counter COD cash the point holds for Hezalli (pickup orders). */}
      {summary.cashOnHand > 0 || summary.totalCodCollected > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-500">
              {t("cashToRemit")}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {money(summary.cashOnHand)}
            </p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-muted-foreground text-xs font-medium">
              {t("totalCodCollected")}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {money(summary.totalCodCollected)}
            </p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-muted-foreground text-xs font-medium">
              {t("totalCodRemitted")}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {money(summary.totalCodRemitted)}
            </p>
          </div>
        </div>
      ) : null}

      {/* Digital remittance (docs §38): transfer the held cash over a rail
          and file the reference — staff confirm and the cash side settles. */}
      {summary.cashOnHand > 0 || pendingClaim ? (
        <section className="space-y-2 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">{t("remitTitle")}</h2>
          {pendingClaim ? (
            <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-500">
              {t("remitPending", {
                amount: money(Number(pendingClaim.amountUsd)),
                method: t(`remitMethod_${pendingClaim.method}`),
                reference: pendingClaim.reference,
              })}
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-xs">{t("remitHint")}</p>
              <RemitClaimForm
                who="point"
                namespace="Point"
                max={summary.cashOnHand}
              />
            </>
          )}
        </section>
      ) : null}

      {/* Sweep the earnings balance straight into the HezalliPay wallet
          (instant), or ask Hezalli to pay it out to a rail (docs §22).
          Owner only — both pay the OWNER, so staff never see the forms
          (and the actions refuse them anyway). */}
      {canMoveEarnings(gate.access) ? (
        <>
          <MoveEarningsToWallet
            action={transferPointEarningsToWallet}
            namespace="Point"
            disabled={summary.balance <= 0}
          />
          <PayoutRequestForm free={summary.balance} hasOpen={hasOpen} />
        </>
      ) : null}
      {payoutRequests.length > 0 ? (
        <ul className="divide-y rounded-xl border">
          {payoutRequests.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t(`payout_${r.status}`)}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {format.dateTime(r.createdAt, { dateStyle: "medium" })}
                  {r.note ? ` — ${r.note}` : null}
                </p>
              </div>
              <span className="font-semibold" dir="ltr">
                {money(Number(r.amountUsd))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Record COD cash a courier hands in at the counter. */}
      <DriverCashInForm drivers={drivers} />

      {entries.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
          {page > 1 ? t("noMoreEntries") : t("noEntries")}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t(`ledger_${e.type}`)}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {format.dateTime(e.createdAt, { dateStyle: "medium" })}
                  {e.note ? ` — ${e.note}` : null}
                </p>
              </div>
              <span
                className={
                  Number(e.amountUsd) >= 0
                    ? "font-semibold text-emerald-600"
                    : "text-destructive font-semibold"
                }
                dir="ltr"
              >
                {money(Number(e.amountUsd))}
              </span>
            </li>
          ))}
        </ul>
      )}

      {page > 1 || hasMore ? (
        <div className="flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={`/point/ledger?page=${page - 1}`}
              className="text-primary text-sm font-medium hover:underline"
            >
              {t("prevPage")}
            </Link>
          ) : (
            <span />
          )}
          {hasMore ? (
            <Link
              href={`/point/ledger?page=${page + 1}`}
              className="text-primary text-sm font-medium hover:underline"
            >
              {t("nextPage")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
