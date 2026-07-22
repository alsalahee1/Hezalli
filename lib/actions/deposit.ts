"use server";

// Security deposits (docs §32): money Hezalli physically holds from a courier
// or point operator, recorded here so the COD credit limit can follow it 1:1.
// Optional — zero is a valid deposit. Admin-set only; every change is audited
// and the holder is notified. The cash itself moves outside the system
// (office safe / bank), exactly like payout references.
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

const parseAmount = (raw: unknown): number | null => {
  const n = Math.round(Number(raw) * 100) / 100;
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function setCourierDeposit(formData: FormData): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  const courierId = String(formData.get("courierId") ?? "");
  const amount = parseAmount(formData.get("amount"));
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 200);
  if (!courierId || amount == null) return { error: "badInput" };

  const courier = await prisma.user.findUnique({
    where: { id: courierId },
    select: { roles: true, courierDepositUsd: true },
  });
  if (!courier?.roles.includes("COURIER")) return { error: "notCourier" };
  const previous = Number(courier.courierDepositUsd);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: courierId },
      data: { courierDepositUsd: amount },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: "courier.deposit",
        entity: "User",
        entityId: courierId,
        meta: { previous, amount, note: note || undefined },
      },
    }),
    prisma.notification.create({
      data: {
        userId: courierId,
        type: "PAYMENT",
        title: "Security deposit updated",
        body: `Your deposit with Hezalli is now ${amount.toFixed(2)} USD — it raises your COD cash limit by the same amount.`,
        data: { link: "/driver/ledger" },
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/couriers/${courierId}`);
  revalidatePath(`/${locale}/admin/couriers`);
  return { ok: true };
}

export async function setPointDeposit(formData: FormData): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  const pointId = String(formData.get("pointId") ?? "");
  const amount = parseAmount(formData.get("amount"));
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 200);
  if (!pointId || amount == null) return { error: "badInput" };

  const point = await prisma.deliveryPoint.findUnique({
    where: { id: pointId },
    select: { depositUsd: true, owner: { select: { id: true } } },
  });
  if (!point) return { error: "notPoint" };
  const previous = Number(point.depositUsd);

  await prisma.$transaction([
    prisma.deliveryPoint.update({
      where: { id: pointId },
      data: { depositUsd: amount },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: "point.deposit",
        entity: "DeliveryPoint",
        entityId: pointId,
        meta: { previous, amount, note: note || undefined },
      },
    }),
    prisma.notification.create({
      data: {
        userId: point.owner.id,
        type: "PAYMENT",
        title: "Security deposit updated",
        body: `Your point's deposit with Hezalli is now ${amount.toFixed(2)} USD — it raises your cash holding limit by the same amount.`,
        data: { link: "/point/ledger" },
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/points/${pointId}`);
  revalidatePath(`/${locale}/admin/points`);
  return { ok: true };
}
