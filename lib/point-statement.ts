// Hub monthly statement (docs/DELIVERY-POINTS.md §28). Every ledger row is
// signed and immutable, so opening balances and monthly deltas are pure SUMs
// over the same DeliveryPointLedgerEntry table the live balances use —
// nothing stored, nothing to drift.
import { prisma } from "@/lib/prisma";

const round2 = (n: number) => Math.round(n * 100) / 100;

// The two sides of a hub's books (see lib/point-ledger.ts).
const EARNING_TYPES = ["HANDLING_FEE", "PAYOUT", "ADJUSTMENT"] as const;
const CASH_TYPES = [
  "COD_COLLECTED",
  "DRIVER_CASH_IN",
  "COD_REMITTANCE",
] as const;

export type StatementEntry = {
  id: string;
  type: string;
  amountUsd: number;
  note: string | null;
  createdAt: Date;
};

export type StatementSide = {
  opening: number;
  delta: number;
  closing: number;
  byType: Record<string, number>; // in-range signed totals per entry type
};

export type PointStatement = {
  earnings: StatementSide;
  cash: StatementSide;
  entries: StatementEntry[]; // all entries in range, oldest first
};

// Shared with the courier statement (lib/courier-statement.ts) — same math,
// different ledger table.
export function buildStatementSide(
  types: readonly string[],
  opening: Map<string, number>,
  inRange: Map<string, number>,
): StatementSide {
  const open = round2(types.reduce((s, t) => s + (opening.get(t) ?? 0), 0));
  const byType: Record<string, number> = {};
  for (const t of types) byType[t] = round2(inRange.get(t) ?? 0);
  const delta = round2(types.reduce((s, t) => s + (inRange.get(t) ?? 0), 0));
  return { opening: open, delta, closing: round2(open + delta), byType };
}

/** The hub's books for [from, to): opening → entries → closing, both sides. */
export async function pointStatement(
  pointId: string,
  from: Date,
  to: Date,
): Promise<PointStatement> {
  const [before, during, entries] = await Promise.all([
    prisma.deliveryPointLedgerEntry.groupBy({
      by: ["type"],
      where: { pointId, createdAt: { lt: from } },
      _sum: { amountUsd: true },
    }),
    prisma.deliveryPointLedgerEntry.groupBy({
      by: ["type"],
      where: { pointId, createdAt: { gte: from, lt: to } },
      _sum: { amountUsd: true },
    }),
    prisma.deliveryPointLedgerEntry.findMany({
      where: { pointId, createdAt: { gte: from, lt: to } },
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

/** Parse "YYYY-MM" (falling back to the current month) → [from, to) in UTC. */
export function monthRange(month?: string | null): {
  from: Date;
  to: Date;
  key: string;
} {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  const now = new Date();
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const mon = m ? Number(m[2]) - 1 : now.getUTCMonth();
  const from = new Date(Date.UTC(year, mon, 1));
  const to = new Date(Date.UTC(year, mon + 1, 1));
  const key = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, "0")}`;
  return { from, to, key };
}

/** The statement's entry list as CSV (date, type, amount, note). */
export function statementCsv(entries: StatementEntry[]): string {
  const esc = (s: string) => `"${s.replaceAll('"', '""')}"`;
  const lines = [
    "date,type,amount_usd,note",
    ...entries.map((e) =>
      [
        e.createdAt.toISOString(),
        e.type,
        e.amountUsd.toFixed(2),
        esc(e.note ?? ""),
      ].join(","),
    ),
  ];
  return lines.join("\n") + "\n";
}
