"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string; token?: string };

// Mint (once) and return the unguessable receipt token for one of the caller's
// own transactions, so the client can build a shareable /receipt/[token] link.
// Idempotent: an entry that already has a token returns the same one.
export async function createReceiptShareLink(entryId: string): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };

  const entry = await prisma.walletEntry.findFirst({
    where: { id: entryId, wallet: { userId: session.user.id } },
    select: { id: true, receiptToken: true },
  });
  if (!entry) return { error: "notFound" };
  if (entry.receiptToken) return { ok: true, token: entry.receiptToken };

  const token = crypto.randomUUID().replace(/-/g, "");
  await prisma.walletEntry.update({
    where: { id: entry.id },
    data: { receiptToken: token },
  });
  return { ok: true, token };
}
