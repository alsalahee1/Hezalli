// Transaction detail + shareable receipts (Step 19.8). Verifies a transfer's
// ledger entries enrich into receipts with the right direction/counterparty,
// that ownership is enforced, and that the share token round-trips.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));

import { createReceiptShareLink } from "@/lib/actions/wallet-receipt";
import { prisma } from "@/lib/prisma";
import { transferFunds } from "@/lib/wallet-transfers";
import { getWalletId, recomputeWalletBalance } from "@/lib/wallet";
import { loadReceiptByToken, loadReceiptForOwner } from "@/lib/wallet-receipt";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let senderId: string;
let recipientId: string;
let outEntryId: string;
let inEntryId: string;

beforeAll(async () => {
  const uniq = Date.now().toString(36);
  const sender = await prisma.user.create({
    data: {
      email: `rcpt-sender-${uniq}@t.local`,
      name: "Sender One",
      roles: ["BUYER"],
      locale: "en",
    },
  });
  const recipient = await prisma.user.create({
    data: {
      email: `rcpt-recip-${uniq}@t.local`,
      name: "Recipient Two",
      roles: ["BUYER"],
      locale: "en",
    },
  });
  senderId = sender.id;
  recipientId = recipient.id;

  const walletId = await getWalletId(senderId);
  await prisma.walletEntry.create({
    data: { walletId, type: "TOP_UP", amountUsd: 100 },
  });
  await recomputeWalletBalance(senderId);

  const res = await transferFunds(senderId, recipientId, 40, "rent");
  expect(res.ok).toBe(true);

  const out = await prisma.walletEntry.findFirstOrThrow({
    where: { wallet: { userId: senderId }, type: "TRANSFER_OUT" },
  });
  const inn = await prisma.walletEntry.findFirstOrThrow({
    where: { wallet: { userId: recipientId }, type: "TRANSFER_IN" },
  });
  outEntryId = out.id;
  inEntryId = inn.id;
});

afterAll(async () => {
  for (const uid of [senderId, recipientId]) {
    await prisma.walletEntry
      .deleteMany({ where: { wallet: { userId: uid } } })
      .catch(() => {});
    await prisma.walletTransfer
      .deleteMany({ where: { fromWallet: { userId: uid } } })
      .catch(() => {});
    await prisma.wallet.deleteMany({ where: { userId: uid } }).catch(() => {});
  }
  await prisma.user
    .deleteMany({ where: { id: { in: [senderId, recipientId] } } })
    .catch(() => {});
});

describe("wallet receipts (Step 19.8)", () => {
  it("enriches the sender's entry into an outgoing receipt", async () => {
    const r = await loadReceiptForOwner(outEntryId, senderId);
    expect(r).not.toBeNull();
    expect(r!.direction).toBe("out");
    expect(r!.amountUsd).toBe(40);
    expect(r!.status).toBe("completed");
    expect(r!.counterpartyName).toBe("Recipient Two");
    expect(r!.reference.startsWith("HZ-")).toBe(true);
  });

  it("enriches the recipient's entry into an incoming receipt", async () => {
    const r = await loadReceiptForOwner(inEntryId, recipientId);
    expect(r!.direction).toBe("in");
    expect(r!.counterpartyName).toBe("Sender One");
  });

  it("does not leak a receipt to a non-owner", async () => {
    const r = await loadReceiptForOwner(outEntryId, recipientId);
    expect(r).toBeNull();
  });

  it("mints a share token idempotently and resolves it publicly", async () => {
    as(senderId);
    const first = await createReceiptShareLink(outEntryId);
    expect(first.ok).toBe(true);
    expect(first.token).toBeTruthy();

    const second = await createReceiptShareLink(outEntryId);
    expect(second.token).toBe(first.token);

    const r = await loadReceiptByToken(first.token!);
    expect(r!.entryId).toBe(outEntryId);
    expect(r!.counterpartyName).toBe("Recipient Two");
  });

  it("refuses to mint a token for someone else's entry", async () => {
    as(recipientId);
    const bad = await createReceiptShareLink(outEntryId);
    expect(bad.error).toBe("notFound");
  });
});
