// Hub monthly statement (docs/DELIVERY-POINTS.md §28): opening excludes the
// month, closing = opening + the month's delta, on both sides of the books.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  monthRange,
  pointStatement,
  statementCsv,
} from "@/lib/point-statement";
import { prisma } from "@/lib/prisma";

let ownerId: string;
let pointId: string;

// A fixed month well in the past so concurrent suites can't write into it.
const FROM = new Date(Date.UTC(2024, 5, 1)); // 2024-06-01
const TO = new Date(Date.UTC(2024, 6, 1)); // 2024-07-01

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const owner = await prisma.user.create({
    data: {
      email: `st2-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: `Statement Point ${uniq}`,
      phone: "770000018",
      governorate: "Aden",
      city: "Aden",
      addressLine: "Statement st",
    },
  });
  ownerId = owner.id;
  pointId = point.id;

  // Before the month: fees 10, payout −4 (earnings opening 6); COD 20,
  // remitted −5 (cash opening 15). In the month: fee 2.5, adjustment −0.5,
  // driver cash-in 7, remittance −10.
  const rows: {
    type:
      | "HANDLING_FEE"
      | "PAYOUT"
      | "ADJUSTMENT"
      | "COD_COLLECTED"
      | "DRIVER_CASH_IN"
      | "COD_REMITTANCE";
    amountUsd: number;
    at: Date;
  }[] = [
    {
      type: "HANDLING_FEE",
      amountUsd: 10,
      at: new Date(Date.UTC(2024, 4, 10)),
    },
    { type: "PAYOUT", amountUsd: -4, at: new Date(Date.UTC(2024, 4, 20)) },
    {
      type: "COD_COLLECTED",
      amountUsd: 20,
      at: new Date(Date.UTC(2024, 4, 15)),
    },
    {
      type: "COD_REMITTANCE",
      amountUsd: -5,
      at: new Date(Date.UTC(2024, 4, 25)),
    },
    {
      type: "HANDLING_FEE",
      amountUsd: 2.5,
      at: new Date(Date.UTC(2024, 5, 3)),
    },
    {
      type: "ADJUSTMENT",
      amountUsd: -0.5,
      at: new Date(Date.UTC(2024, 5, 10)),
    },
    {
      type: "DRIVER_CASH_IN",
      amountUsd: 7,
      at: new Date(Date.UTC(2024, 5, 12)),
    },
    {
      type: "COD_REMITTANCE",
      amountUsd: -10,
      at: new Date(Date.UTC(2024, 5, 20)),
    },
    // After the month: must not appear anywhere in this statement.
    { type: "HANDLING_FEE", amountUsd: 99, at: new Date(Date.UTC(2024, 6, 2)) },
  ];
  for (const r of rows) {
    await prisma.deliveryPointLedgerEntry.create({
      data: {
        pointId,
        type: r.type,
        amountUsd: r.amountUsd,
        createdAt: r.at,
      },
    });
  }
});

afterAll(async () => {
  await prisma.deliveryPoint.delete({ where: { id: pointId } }).catch(() => {});
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
});

describe("pointStatement", () => {
  it("computes opening / delta / closing on both sides", async () => {
    const stmt = await pointStatement(pointId, FROM, TO);

    expect(stmt.earnings.opening).toBe(6); // 10 − 4
    expect(stmt.earnings.delta).toBe(2); // 2.5 − 0.5
    expect(stmt.earnings.closing).toBe(8);
    expect(stmt.earnings.byType.HANDLING_FEE).toBe(2.5);
    expect(stmt.earnings.byType.ADJUSTMENT).toBe(-0.5);

    expect(stmt.cash.opening).toBe(15); // 20 − 5
    expect(stmt.cash.delta).toBe(-3); // 7 − 10
    expect(stmt.cash.closing).toBe(12);

    // Only the month's four entries, oldest first; the July fee is absent.
    expect(stmt.entries).toHaveLength(4);
    expect(stmt.entries[0].type).toBe("HANDLING_FEE");
    expect(stmt.entries.map((e) => e.amountUsd)).toEqual([2.5, -0.5, 7, -10]);

    const csv = statementCsv(stmt.entries);
    expect(csv.split("\n")[0]).toBe("date,type,amount_usd,note");
    expect(csv).toContain("HANDLING_FEE,2.50");
    expect(csv).not.toContain("99.00");
  });

  it("monthRange parses YYYY-MM and rejects garbage", () => {
    const r = monthRange("2024-06");
    expect(r.from.toISOString()).toBe("2024-06-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2024-07-01T00:00:00.000Z");
    expect(r.key).toBe("2024-06");
    // Garbage falls back to the current month (a valid, parseable key).
    expect(monthRange("junk").key).toMatch(/^\d{4}-\d{2}$/);
  });
});
