"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { applyRefund } from "@/lib/refunds";

type Result = { ok?: boolean; error?: string };

export type DisputeOutcome =
  "refund_buyer" | "partial_refund" | "release_seller" | "other";

// Load a dispute with the parties, verifying the caller is an admin or a party.
async function loadDispute(disputeId: string) {
  return prisma.dispute.findUnique({
    where: { id: disputeId },
    select: {
      id: true,
      status: true,
      returnId: true,
      returnRequest: {
        select: {
          buyerId: true,
          subOrderId: true,
          subOrder: {
            select: {
              orderId: true,
              store: {
                select: { seller: { select: { userId: true } } },
              },
            },
          },
        },
      },
    },
  });
}

// Admin or an involved party posts to the dispute thread.
export async function postDisputeMessage(
  disputeId: string,
  body: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;
  const text = (body ?? "").trim();
  if (text.length < 1) return { error: "empty" };

  const dispute = await loadDispute(disputeId);
  if (!dispute) return { error: "notFound" };

  const buyerId = dispute.returnRequest.buyerId;
  const sellerUserId = dispute.returnRequest.subOrder.store.seller.userId;
  const isParty = userId === buyerId || userId === sellerUserId;
  const adminId = await requireAdminId();
  if (!isParty && !adminId) return { error: "forbidden" };

  await prisma.disputeMessage.create({
    data: { disputeId, senderId: userId, body: text },
  });

  // First admin touch moves it under review.
  if (adminId && dispute.status === "OPEN") {
    await prisma.dispute.update({
      where: { id: disputeId },
      data: { status: "UNDER_REVIEW", assignedTo: adminId },
    });
  }

  // Notify the counterpart(s).
  const recipients = new Set<string>();
  if (adminId) {
    recipients.add(buyerId);
    recipients.add(sellerUserId);
  } else {
    // A party posted → notify admins + the other party.
    const admins = await prisma.user.findMany({
      where: { roles: { has: "ADMIN" }, isSuspended: false },
      select: { id: true },
    });
    admins.forEach((a) => recipients.add(a.id));
    recipients.add(userId === buyerId ? sellerUserId : buyerId);
  }
  recipients.delete(userId);
  if (recipients.size > 0) {
    await prisma.notification.createMany({
      data: [...recipients].map((rid) => ({
        userId: rid,
        type: "DISPUTE" as const,
        title: "New dispute message",
        body: text.slice(0, 140),
        data: {
          orderId: dispute.returnRequest.subOrder.orderId,
          disputeId,
        },
      })),
    });
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/disputes/${disputeId}`);
  revalidatePath(
    `/${locale}/account/orders/${dispute.returnRequest.subOrder.orderId}`,
  );
  revalidatePath(`/${locale}/seller/returns`);
  return { ok: true };
}

// Admin issues a verdict; money moves automatically and both sides are notified.
export async function resolveDispute(input: {
  disputeId: string;
  outcome: DisputeOutcome;
  decision: string;
  amountUsd?: number;
}): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const decision = (input.decision ?? "").trim();
  if (decision.length < 3) return { error: "decisionRequired" };

  const dispute = await prisma.dispute.findUnique({
    where: { id: input.disputeId },
    select: {
      id: true,
      status: true,
      returnId: true,
      returnRequest: {
        select: {
          buyerId: true,
          subOrderId: true,
          reason: true,
          subOrder: {
            select: {
              orderId: true,
              store: {
                select: { seller: { select: { userId: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!dispute) return { error: "notFound" };
  if (
    dispute.status === "RESOLVED_BUYER" ||
    dispute.status === "RESOLVED_SELLER"
  ) {
    return { error: "alreadyResolved" };
  }

  const ret = dispute.returnRequest;
  const orderId = ret.subOrder.orderId;
  const sellerUserId = ret.subOrder.store.seller.userId;

  let disputeStatus: "RESOLVED_BUYER" | "RESOLVED_SELLER" | "CLOSED" = "CLOSED";
  let returnStatus: "REFUNDED" | "CLOSED" = "CLOSED";
  let refundId: string | null = null;

  if (input.outcome === "refund_buyer" || input.outcome === "partial_refund") {
    const refund = await applyRefund(ret.subOrderId, {
      reason: `Dispute verdict: ${decision}`,
      amountUsd:
        input.outcome === "partial_refund" ? input.amountUsd : undefined,
      actor: "admin",
      processedBy: adminId,
    });
    if (refund.error && refund.error !== "badState") {
      return { error: refund.error };
    }
    refundId = refund.refundId ?? null;
    disputeStatus = "RESOLVED_BUYER";
    returnStatus = "REFUNDED";
  } else if (input.outcome === "release_seller") {
    disputeStatus = "RESOLVED_SELLER";
    returnStatus = "CLOSED";
  } else {
    disputeStatus = "CLOSED";
    returnStatus = "CLOSED";
  }

  await prisma.$transaction([
    prisma.dispute.update({
      where: { id: dispute.id },
      data: { status: disputeStatus, verdict: decision, assignedTo: adminId },
    }),
    prisma.returnRequest.update({
      where: { id: dispute.returnId },
      data: {
        status: returnStatus,
        resolution: decision,
        ...(refundId ? { refundId } : {}),
      },
    }),
    prisma.orderStatusHistory.create({
      data: {
        orderId,
        status: "DISPUTE",
        actor: "admin",
        note: `Dispute resolved (${input.outcome}) — ${decision}`,
      },
    }),
    prisma.notification.createMany({
      data: [ret.buyerId, sellerUserId].map((uid) => ({
        userId: uid,
        type: "DISPUTE" as const,
        title: "Dispute resolved",
        body: decision.slice(0, 140),
        data: { orderId, disputeId: dispute.id },
      })),
    }),
  ]);

  revalidatePath(`/${locale}/admin/disputes`);
  revalidatePath(`/${locale}/admin/disputes/${dispute.id}`);
  revalidatePath(`/${locale}/account/orders/${orderId}`);
  revalidatePath(`/${locale}/seller/returns`);
  return { ok: true };
}
