// Courier monthly statement (docs/DELIVERY-POINTS.md §30): the v1.12 hub
// statement math over the driver's CourierLedgerEntry table. Same pure-SUM
// approach — every row is signed and immutable, so opening balances and
// monthly deltas can never disagree with the live tiles.
import {
  buildStatementSide,
  type StatementEntry,
  type StatementSide,
} from "@/lib/point-statement";
import { prisma } from "@/lib/prisma";

// The two sides of a driver's books. ADJUSTMENT counts toward CASH to match
// courierCashSummary (lib/courier-ledger.ts) — the statement must always
// agree with the live tiles.
const EARNING_TYPES = ["EARNING", "PAYOUT"] as const;
const CASH_TYPES = ["COD_COLLECTED", "REMITTANCE", "ADJUSTMENT"] as const;

export type CourierStatement = {
  earnings: StatementSide;
  cash: StatementSide;
  entries: StatementEntry[]; // all entries in range, oldest first
};

/** The driver's books for [from, to): opening → entries → closing, both sides. */
export async function courierStatement(
  courierId: string,
  from: Date,
  to: Date,
): Promise<CourierStatement> {
  const [before, during, entries] = await Promise.all([
    prisma.courierLedgerEntry.groupBy({
      by: ["type"],
      where: { courierId, createdAt: { lt: from } },
      _sum: { amountUsd: true },
    }),
    prisma.courierLedgerEntry.groupBy({
      by: ["type"],
      where: { courierId, createdAt: { gte: from, lt: to } },
      _sum: { amountUsd: true },
    }),
    prisma.courierLedgerEntry.findMany({
      where: { courierId, createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: "asc" },
      take: 1000,
      select: {
        id: true,
        type: true,
        amountUsd: true,
        note: true,
        createdAt: true,
      },
    }),
  ]);
  const toMap = (rows: typeof before) =>
    new Map(rows.map((r) => [r.type as string, Number(r._sum.amountUsd ?? 0)]));
  const opening = toMap(before);
  const inRange = toMap(during);

  return {
    earnings: buildStatementSide(EARNING_TYPES, opening, inRange),
    cash: buildStatementSide(CASH_TYPES, opening, inRange),
    entries: entries.map((e) => ({
      id: e.id,
      type: e.type,
      amountUsd: Number(e.amountUsd),
      note: e.note,
      createdAt: e.createdAt,
    })),
  };
}
