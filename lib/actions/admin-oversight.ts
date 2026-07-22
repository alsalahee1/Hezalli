"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { settleSubOrder } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

type Result = { ok?: boolean; error?: string };

const ROLES = [
  "BUYER",
  "SELLER",
  "ADMIN",
  "WALLET_MANAGER",
  "DELIVERY_MANAGER",
];

async function audit(
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  meta?: Prisma.InputJsonValue,
) {
  await prisma.auditLog.create({
    data: { actorId, action, entity, entityId, meta: meta ?? {} },
  });
}

export async function setUserSuspended(
  userId: string,
  suspended: boolean,
  reason?: string,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  if (userId === adminId) return { error: "self" };
  await prisma.user.update({
    where: { id: userId },
    data: { isSuspended: suspended },
  });
  await audit(
    adminId,
    suspended ? "user.suspend" : "user.unsuspend",
    "User",
    userId,
    {
      reason: reason ?? null,
    },
  );
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/users`);
  return { ok: true };
}

export async function setUserRoles(
  userId: string,
  roles: string[],
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const clean = [...new Set(roles)].filter((r) => ROLES.includes(r));
  if (clean.length === 0) clean.push("BUYER");
  await prisma.user.update({
    where: { id: userId },
    data: { roles: clean as never },
  });
  await audit(adminId, "user.roles", "User", userId, { roles: clean });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/users`);
  return { ok: true };
}

export async function softDeleteUser(userId: string): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  if (userId === adminId) return { error: "self" };
  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  });
  await audit(adminId, "user.delete", "User", userId);
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/users`);
  return { ok: true };
}

// Set (or clear) a seller's negotiated commission rate. `ratePercent` is a
// human percentage (e.g. 8 → 0.08); null clears the override so the seller
// falls back to the platform-wide rate. Applies to future orders only —
// existing sub-orders keep the rate they were placed with.
export async function setSellerCommission(
  sellerId: string,
  ratePercent: number | null,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  let rate: number | null = null;
  if (ratePercent != null && `${ratePercent}`.trim() !== "") {
    const n = Number(ratePercent);
    if (!Number.isFinite(n) || n < 0 || n >= 100) return { error: "badRate" };
    rate = Math.round(n * 100) / 10000; // percent → decimal, 4 dp
  }

  const seller = await prisma.sellerProfile.findUnique({
    where: { id: sellerId },
    select: { id: true },
  });
  if (!seller) return { error: "notFound" };

  await prisma.sellerProfile.update({
    where: { id: sellerId },
    data: { commissionRate: rate },
  });
  await audit(adminId, "seller.commission", "SellerProfile", sellerId, {
    rate,
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/sellers/${sellerId}`);
  revalidatePath(`/${locale}/admin/sellers`);
  return { ok: true };
}

// Admin force-changes an order's status (audit-logged). Forcing COMPLETED also
// settles each sub-order so sellers aren't left unpaid; other statuses are a
// plain status write (refund/cancel money is handled by the dedicated tools).
export async function forceOrderStatus(
  orderId: string,
  status: string,
  note: string,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      subOrders: {
        select: {
          id: true,
          status: true,
          shipment: { select: { id: true, status: true } },
        },
      },
    },
  });
  if (!order) return { error: "notFound" };

  // Keep shipment records consistent with the forced status: an order forced
  // to DELIVERED/COMPLETED must not leave its shipments dangling IN_TRANSIT.
  const openShipments =
    status === "DELIVERED" || status === "COMPLETED"
      ? order.subOrders.flatMap((s) =>
          s.shipment && s.shipment.status !== "DELIVERED" ? [s.shipment] : [],
        )
      : [];

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { status: status as never },
    }),
    prisma.orderStatusHistory.create({
      data: {
        orderId,
        status,
        actor: "admin",
        note: note || `Forced to ${status} by admin`,
      },
    }),
    ...openShipments.flatMap((sh) => [
      prisma.shipment.update({
        where: { id: sh.id },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      }),
      prisma.shipmentEvent.create({
        data: {
          shipmentId: sh.id,
          status: "DELIVERED",
          note: note || `Order forced to ${status} by admin`,
        },
      }),
    ]),
  ]);
  // Forcing an order COMPLETED must also settle its sellers — otherwise the
  // order reads "completed" while sub-orders stay unsettled and settleSubOrder
  // never runs, silently leaving sellers unpaid. Bring each non-terminal
  // sub-order to COMPLETED and settle it (idempotent; correct COD vs prepaid
  // handling lives in settleSubOrder). Refund/cancel semantics for a forced
  // CANCELLED/REFUNDED are intentionally left to the dedicated refund tools.
  if (status === "COMPLETED") {
    for (const s of order.subOrders) {
      if (["COMPLETED", "CANCELLED", "REFUNDED"].includes(s.status)) continue;
      const upd = await prisma.subOrder.updateMany({
        where: {
          id: s.id,
          status: { notIn: ["COMPLETED", "CANCELLED", "REFUNDED"] },
        },
        data: { status: "COMPLETED" },
      });
      if (upd.count === 1) await settleSubOrder(s.id);
    }
  }

  await audit(adminId, "order.forceStatus", "Order", orderId, {
    from: order.status,
    to: status,
    note,
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/orders/${orderId}`);
  return { ok: true };
}
