import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { setPointCapacity } from "@/lib/actions/point-application";
import { pointLedgerSummary } from "@/lib/point-ledger";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { DepositForm } from "@/components/admin/deposit-form";
import { PointPayoutForm } from "@/components/admin/point-payout-form";
import { PointPayoutRequests } from "@/components/admin/point-payout-requests";
import { AdminStaffRoster } from "@/components/admin/admin-staff-roster";

// Per-point settlement: headline balance + fee/payout totals, a record-a-
// payout form, and the raw ledger. The balance is what Hezalli owes the
// operator for parcels handled through their hub.
export async function PointDetailView({
  base,
  params,
}: {
  base: string;
  params: Promise<{ pointId: string }>;
}) {
  const { pointId } = await params;
  const t = await getTranslations("AdminPoints");
  const format = await getFormatter();

  const point = await prisma.deliveryPoint.findUnique({
    where: { id: pointId },
    select: {
      id: true,
      name: true,
      governorate: true,
      city: true,
      addressLine: true,
      phone: true,
      status: true,
      capacity: true,
      depositUsd: true,
      owner: { select: { name: true, email: true } },
      // The hub's team (docs §42d) — ops sees who works here and can pause a
      // member's access during an investigation (owner-invisible until now).
      staff: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          isActive: true,
          createdAt: true,
          user: { select: { name: true, phone: true, email: true } },
        },
      },
    },
  });
  if (!point) notFound();

  // Current load (held + inbound), same definition as lib/point-select.ts.
  const load = await prisma.shipment.count({
    where: {
      deliveryPointId: pointId,
      status: { in: ["LABEL_CREATED", "AT_POINT", "RETURNED_TO_POINT"] },
      subOrder: { status: "SHIPPED" },
    },
  });

  const [summary, cashLimitBase, entries, payoutRequests] = await Promise.all([
    pointLedgerSummary(pointId),
    getSetting("point_cash_limit"),
    prisma.deliveryPointLedgerEntry.findMany({
      where: { pointId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        amountUsd: true,
        note: true,
        subOrderId: true,
        createdAt: true,
      },
    }),
    prisma.pointPayoutRequest.findMany({
      where: { pointId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        amountUsd: true,
        status: true,
        note: true,
        createdAt: true,
      },
    }),
  ]);

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const stats: { key: string; value: number; accent?: boolean }[] = [
    { key: "balanceOwed", value: summary.balance, accent: true },
    { key: "totalFees", value: summary.totalFees },
    { key: "totalPaidOut", value: summary.totalPaidOut },
    { key: "cashOnHand", value: summary.cashOnHand, accent: true },
    { key: "totalCodCollected", value: summary.totalCodCollected },
    { key: "totalCodRemitted", value: summary.totalCodRemitted },
  ];

  return (
    <div className="space-y-6">
      <Link
        href={`${base}/points`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("backToPoints")}
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          {point.name}
          {point.status === "SUSPENDED" ? (
            <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs font-medium">
              {t("suspended")}
            </span>
          ) : null}
        </h1>
        <p className="text-muted-foreground text-sm">
          {point.addressLine}, {point.city}, {point.governorate} ·{" "}
          <span dir="ltr">{point.phone}</span> · {point.owner.email}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.key}
            className={cn(
              "rounded-lg border p-3",
              s.accent && "border-emerald-500/40 bg-emerald-500/5",
            )}
          >
            <p className="text-muted-foreground text-xs font-medium">
              {t(s.key)}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {money(s.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Capacity: max parcels held/inbound at once. Empty = unlimited. */}
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">{t("capacityHeading")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("capacityLoad", { load })}
          {point.capacity != null ? ` / ${point.capacity}` : ""}
        </p>
        <form
          action={setPointCapacity}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="pointId" value={point.id} />
          <input
            type="number"
            name="capacity"
            min={1}
            defaultValue={point.capacity ?? ""}
            placeholder={t("capacityUnlimited")}
            className="h-9 w-36 rounded-md border bg-transparent px-3 text-sm"
            dir="ltr"
          />
          <button
            type="submit"
            className="bg-primary text-primary-foreground h-9 rounded-md px-3 text-sm font-medium"
          >
            {t("capacitySave")}
          </button>
          <span className="text-muted-foreground text-xs">
            {t("capacityHint")}
          </span>
        </form>
      </section>

      {/* Security deposit & personal cash limit (docs §32). */}
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">{t("depositHeading")}</h2>
        <p className="text-muted-foreground text-xs">
          {cashLimitBase > 0
            ? t("depositBreakdown", {
                limit: money(cashLimitBase + Number(point.depositUsd)),
                base: money(cashLimitBase),
                deposit: money(Number(point.depositUsd)),
              })
            : t("depositLimitOff")}
        </p>
        <div className="max-w-sm">
          <DepositForm
            target="point"
            targetId={point.id}
            current={Number(point.depositUsd)}
          />
        </div>
      </section>

      {/* The hub's team + an ops access switch (docs §42d). */}
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">{t("staffHeading")}</h2>
        {point.staff.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("staffNone")}</p>
        ) : (
          <AdminStaffRoster
            pointId={point.id}
            owner={{ name: point.owner.name, email: point.owner.email }}
            staff={point.staff.map((s) => ({
              id: s.id,
              name: s.user.name,
              contact: s.user.phone ?? s.user.email ?? null,
              role: s.role,
              isActive: s.isActive,
              since: format.dateTime(s.createdAt, { dateStyle: "medium" }),
            }))}
          />
        )}
      </section>

      {/* Operator-initiated payout requests (docs §22). */}
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">{t("requestsHeading")}</h2>
        <PointPayoutRequests
          requests={payoutRequests.map((r) => ({
            id: r.id,
            amountUsd: Number(r.amountUsd),
            status: r.status,
            note: r.note,
            createdAt: format.dateTime(r.createdAt, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          }))}
        />
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">{t("recordHeading")}</h2>
        <PointPayoutForm pointId={point.id} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("ledgerHeading")}</h2>
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noEntries")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t(`type_${e.type}`)}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {format.dateTime(e.createdAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {e.note ? ` — ${e.note}` : null}
                  </p>
                </div>
                <span
                  className={cn(
                    "font-semibold",
                    Number(e.amountUsd) >= 0
                      ? "text-emerald-600"
                      : "text-destructive",
                  )}
                  dir="ltr"
                >
                  {money(Number(e.amountUsd))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
