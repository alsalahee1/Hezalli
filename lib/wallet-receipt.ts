// Transaction detail + receipt data (Step 19.8). Turns an immutable WalletEntry
// into a display-ready receipt by joining the source record it points at
// (transfer | bill | topup | withdrawal). Used by the owner's transaction detail
// page (loaded by entry id, ownership-checked) and by the public receipt page
// (loaded by an unguessable receiptToken, no auth). Never exposes balances or
// any other transaction.
import { prisma } from "@/lib/prisma";
import type { WalletEntryType } from "@/lib/generated/prisma/client";

export type ReceiptStatus = "completed" | "pending" | "failed" | "cancelled";

export type ReceiptData = {
  entryId: string;
  reference: string; // human receipt number, e.g. HZ-A1B2C3D4E5
  type: WalletEntryType;
  direction: "in" | "out";
  amountUsd: number; // absolute value
  createdAt: Date;
  status: ReceiptStatus;
  note: string | null;
  ownerName: string | null; // the wallet owner (the "you" side)
  counterpartyName: string | null; // other user (transfers)
  billerSlug: string | null; // bills/airtime
  account: string | null; // bill account / phone
  method: string | null; // topup/withdrawal rail
  hasToken: boolean; // whether a share link already exists
};

function referenceOf(entryId: string): string {
  return `HZ-${entryId.slice(-10).toUpperCase()}`;
}

type EntryRow = {
  id: string;
  type: WalletEntryType;
  amountUsd: unknown;
  note: string | null;
  createdAt: Date;
  refType: string | null;
  refId: string | null;
  receiptToken: string | null;
  wallet: { user: { name: string | null; email: string | null } };
};

// Join the source record and assemble the receipt.
async function enrich(entry: EntryRow): Promise<ReceiptData> {
  const amount = Number(entry.amountUsd);
  const direction: "in" | "out" = amount >= 0 ? "in" : "out";
  const base: ReceiptData = {
    entryId: entry.id,
    reference: referenceOf(entry.id),
    type: entry.type,
    direction,
    amountUsd: Math.abs(amount),
    createdAt: entry.createdAt,
    status: "completed",
    note: entry.note ?? null,
    ownerName: entry.wallet.user.name ?? entry.wallet.user.email ?? null,
    counterpartyName: null,
    billerSlug: null,
    account: null,
    method: null,
    hasToken: !!entry.receiptToken,
  };

  if (entry.refType === "transfer" && entry.refId) {
    const tr = await prisma.walletTransfer.findUnique({
      where: { id: entry.refId },
      select: {
        fromWallet: {
          select: { user: { select: { name: true, email: true } } },
        },
        toWallet: { select: { user: { select: { name: true, email: true } } } },
      },
    });
    if (tr) {
      const other = direction === "out" ? tr.toWallet.user : tr.fromWallet.user;
      base.counterpartyName = other.name ?? other.email ?? null;
    }
  } else if (entry.refType === "bill" && entry.refId) {
    const bill = await prisma.walletBillPayment.findUnique({
      where: { id: entry.refId },
      select: { biller: true, account: true, status: true },
    });
    if (bill) {
      base.billerSlug = bill.biller;
      base.account = bill.account;
      base.status =
        bill.status === "COMPLETED"
          ? "completed"
          : bill.status === "FAILED"
            ? "failed"
            : "pending";
    }
  } else if (entry.refType === "topup" && entry.refId) {
    const top = await prisma.walletTopUp.findUnique({
      where: { id: entry.refId },
      select: { method: true, status: true },
    });
    if (top) {
      base.method = top.method;
      base.status = top.status === "CONFIRMED" ? "completed" : "pending";
    }
  } else if (entry.refType === "withdrawal" && entry.refId) {
    const w = await prisma.walletWithdrawal.findUnique({
      where: { id: entry.refId },
      select: { method: true, status: true },
    });
    if (w) {
      base.method = w.method;
      base.status =
        w.status === "PAID"
          ? "completed"
          : w.status === "REJECTED"
            ? "cancelled"
            : "pending";
    }
  }

  return base;
}

const ENTRY_SELECT = {
  id: true,
  type: true,
  amountUsd: true,
  note: true,
  createdAt: true,
  refType: true,
  refId: true,
  receiptToken: true,
  wallet: { select: { user: { select: { name: true, email: true } } } },
} as const;

/** Owner view: load an entry by id, only if it belongs to `userId`. */
export async function loadReceiptForOwner(
  entryId: string,
  userId: string,
): Promise<ReceiptData | null> {
  const entry = await prisma.walletEntry.findFirst({
    where: { id: entryId, wallet: { userId } },
    select: ENTRY_SELECT,
  });
  return entry ? enrich(entry as EntryRow) : null;
}

/** Public view: resolve a shared receipt by its unguessable token. */
export async function loadReceiptByToken(
  token: string,
): Promise<ReceiptData | null> {
  const entry = await prisma.walletEntry.findUnique({
    where: { receiptToken: token },
    select: ENTRY_SELECT,
  });
  return entry ? enrich(entry as EntryRow) : null;
}
