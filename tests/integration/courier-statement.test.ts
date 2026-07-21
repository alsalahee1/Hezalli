// Courier monthly statement (docs/DELIVERY-POINTS.md §30): the hub-statement
// math over CourierLedgerEntry. ADJUSTMENT counts toward the CASH side to
// match courierCashSummary's live tiles.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { courierCashSummary } from "@/lib/courier-ledger";
import { courierStatement } from "@/lib/courier-statement";
import { prisma } from "@/lib/prisma";

let courierId: string;

// A fixed month well in the past so concurrent suites can't write into it.
const FROM = new Date(Date.UTC(2024, 5, 1)); // 2024-06-01
const TO = new Date(Date.UTC(2024, 6, 1)); // 2024-07-01

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const courier = await prisma.user.create({
    data: { email: `cs-drv-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  courierId = courier.id;

  // Before the month: COD 30, remitted −10 (cash opening 20); earned 6,
  // paid −2 (earnings opening 4). In the month: COD 12, remitted −25,
  // adjustment +1 (cash −12); earned 3 (earnings +3). After: noise.
  const rows: {
    type: "COD_COLLECTED" | "REMITTANCE" | "EARNING" | "PAYOUT" | "ADJUSTMENT";
    amountUsd: number;
    at: Date;
  }[] = [
    {
      type: "COD_COLLECTED",
      amountUsd: 30,
      at: new Date(Date.UTC(2024, 4, 5)),
    },
    { type: "REMITTANCE", amountUsd: -10, at: new Date(Date.UTC(2024, 4, 9)) },
    { type: "EARNING", amountUsd: 6, at: new Date(Date.UTC(2024, 4, 5)) },
    { type: "PAYOUT", amountUsd: -2, at: new Date(Date.UTC(2024, 4, 28)) },
    {
      type: "COD_COLLECTED",
      amountUsd: 12,
      at: new Date(Date.UTC(2024, 5, 2)),
    },
    { type: "REMITTANCE", amountUsd: -25, at: new Date(Date.UTC(2024, 5, 15)) },
    { type: "ADJUSTMENT", amountUsd: 1, at: new Date(Date.UTC(2024, 5, 16)) },
    { type: "EARNING", amountUsd: 3, at: new Date(Date.UTC(2024, 5, 20)) },
    { type: "EARNING", amountUsd: 99, at: new Date(Date.UTC(2024, 6, 3)) },
  ];
  for (const r of rows) {
    await prisma.courierLedgerEntry.create({
      data: {
        courierId,
        type: r.type,
        amountUsd: r.amountUsd,
        createdAt: r.at,
      },
    });
  }
});

afterAll(async () => {
  await prisma.courierLedgerEntry
    .deleteMany({ where: { courierId } })
    .catch(() => {});
  await prisma.user.delete({ where: { id: courierId } }).catch(() => {});
});

describe("courierStatement", () => {
  it("computes opening / delta / closing on both sides", async () => {
    const stmt = await courierStatement(courierId, FROM, TO);

    expect(stmt.cash.opening).toBe(20); // 30 − 10
    expect(stmt.cash.delta).toBe(-12); // 12 − 25 + 1
    expect(stmt.cash.closing).toBe(8);
    expect(stmt.cash.byType.ADJUSTMENT).toBe(1);

    expect(stmt.earnings.opening).toBe(4); // 6 − 2
    expect(stmt.earnings.delta).toBe(3);
    expect(stmt.earnings.closing).toBe(7);

    // Only the month's four entries; the July earning is absent.
    expect(stmt.entries).toHaveLength(4);
    expect(stmt.entries.map((e) => e.amountUsd)).toEqual([12, -25, 1, 3]);
  });

  it("closing balances agree with the live courierCashSummary tiles", async () => {
    // All entries are ≤ July, so a statement through 2100 covers everything —
    // its closings must equal the summary the driver home shows.
    const all = await courierStatement(
      courierId,
      new Date(Date.UTC(2000, 0, 1)),
      new Date(Date.UTC(2100, 0, 1)),
    );
    const live = await courierCashSummary(courierId);
    expect(all.cash.closing).toBe(live.cashOnHand);
    expect(all.earnings.closing).toBe(live.earnings);
  });
});
