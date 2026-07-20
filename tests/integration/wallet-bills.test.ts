// Exercises the bill payment / airtime top-up framework (Step 19.7) against
// local Postgres. Only request-context boundaries are mocked: auth() (to
// impersonate the buyer/admin), revalidatePath, and getLocale.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
}));
vi.mock("next-intl/server", async (orig) => ({
  ...(await orig<typeof import("next-intl/server")>()),
  getLocale: vi.fn().mockResolvedValue("en"),
}));

import {
  completeBillPayment,
  failBillPayment,
  payBill,
} from "@/lib/actions/wallet-bills";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  getWalletId,
  getWalletView,
  recomputeWalletBalance,
} from "@/lib/wallet";

const PIN = "1357";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let buyerId: string;
let adminId: string;

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const buyer = await prisma.user.create({
    data: {
      email: `bill-buyer-${uniq}@t.local`,
      roles: ["BUYER"],
      locale: "en",
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: `bill-admin-${uniq}@t.local`,
      roles: ["ADMIN"],
      locale: "en",
    },
  });
  buyerId = buyer.id;
  adminId = admin.id;

  // Enable the framework (off by default).
  await prisma.platformSetting.upsert({
    where: { key: "wallet_bills_enabled" },
    create: { key: "wallet_bills_enabled", value: true },
    update: { value: true },
  });

  // Fund the buyer's wallet with $100 and set a PIN (outflows require it).
  const walletId = await getWalletId(buyerId);
  await prisma.walletEntry.create({
    data: { walletId, type: "TOP_UP", amountUsd: 100 },
  });
  await prisma.wallet.update({
    where: { id: walletId },
    data: { pinHash: await hashPassword(PIN) },
  });
  await recomputeWalletBalance(buyerId);
});

afterAll(async () => {
  for (const uid of [buyerId, adminId]) {
    await prisma.walletBillPayment
      .deleteMany({ where: { wallet: { userId: uid } } })
      .catch(() => {});
    await prisma.walletEntry
      .deleteMany({ where: { wallet: { userId: uid } } })
      .catch(() => {});
    await prisma.wallet.deleteMany({ where: { userId: uid } }).catch(() => {});
  }
  await prisma.user
    .deleteMany({ where: { id: { in: [buyerId, adminId] } } })
    .catch(() => {});
  await prisma.platformSetting
    .deleteMany({ where: { key: "wallet_bills_enabled" } })
    .catch(() => {});
});

describe("wallet bill payment framework (Step 19.7)", () => {
  it("debits the wallet on a bill purchase and keeps balance = Σ entries", async () => {
    as(buyerId);
    const res = await payBill({
      kind: "BILL",
      biller: "public-electricity",
      account: "1234567",
      amountUsd: 30,
      pin: PIN,
    });
    expect(res.ok).toBe(true);
    expect(res.id).toBeTruthy();

    const view = await getWalletView(buyerId);
    expect(view.balance).toBe(70);
    const debit = view.entries.find((e) => e.type === "BILL_PAYMENT");
    expect(debit && Number(debit.amountUsd)).toBe(-30);

    const bill = await prisma.walletBillPayment.findUniqueOrThrow({
      where: { id: res.id },
    });
    expect(bill.status).toBe("PENDING");
    expect(bill.account).toBe("1234567");
  });

  it("refunds the wallet when an admin fails the purchase", async () => {
    as(buyerId);
    const created = await payBill({
      kind: "AIRTIME",
      biller: "yemen-mobile",
      account: "770123456",
      amountUsd: 20,
      pin: PIN,
    });
    expect(created.ok).toBe(true);
    expect((await getWalletView(buyerId)).balance).toBe(50);

    as(adminId);
    const failed = await failBillPayment(created.id!, "provider down");
    expect(failed.ok).toBe(true);

    // Money returned via a BILL_REFUND entry.
    const view = await getWalletView(buyerId);
    expect(view.balance).toBe(70);
    const bill = await prisma.walletBillPayment.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(bill.status).toBe("FAILED");
  });

  it("keeps funds debited when an admin completes the purchase", async () => {
    as(buyerId);
    const created = await payBill({
      kind: "BILL",
      biller: "yemen-net",
      account: "ACC-9",
      amountUsd: 10,
      pin: PIN,
    });
    expect(created.ok).toBe(true);
    expect((await getWalletView(buyerId)).balance).toBe(60);

    as(adminId);
    const done = await completeBillPayment(created.id!, "REF-123");
    expect(done.ok).toBe(true);
    expect((await getWalletView(buyerId)).balance).toBe(60);

    const bill = await prisma.walletBillPayment.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(bill.status).toBe("COMPLETED");
    expect(bill.reference).toBe("REF-123");
  });

  it("rejects a mismatched biller kind and over-balance amounts", async () => {
    as(buyerId);
    // yemen-mobile is an AIRTIME operator, not a BILL biller.
    const bad = await payBill({
      kind: "BILL",
      biller: "yemen-mobile",
      account: "x",
      amountUsd: 5,
      pin: PIN,
    });
    expect(bad.error).toBe("badBiller");

    const tooMuch = await payBill({
      kind: "BILL",
      biller: "public-electricity",
      account: "1",
      amountUsd: 999,
      pin: PIN,
    });
    expect(tooMuch.error).toBe("insufficient");
  });
});
