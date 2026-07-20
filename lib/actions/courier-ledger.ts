"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

// Admin records that a courier handed in cash (a remittance) — a negative
// ledger row that reduces the driver's cash-on-hand. Also used for a manual
// ADJUSTMENT (± correction). Both are audited.
export async function recordRemittance(formData: FormData): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  const courierId = String(formData.get("courierId") ?? "");
  const kind = String(formData.get("kind") ?? "remittance"); // remittance | adjustment
  const raw = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();
  if (!courierId) return { error: "badInput" };

  const courier = await prisma.user.findUnique({
    where: { id: courierId },
    select: { roles: true },
  });
  if (!courier?.roles.includes("COURIER")) return { error: "notCourier" };

  let type: "REMITTANCE" | "ADJUSTMENT";
  let amountUsd: number;
  if (kind === "adjustment") {
    // A signed correction (may be + or −). Reject zero.
    if (!Number.isFinite(raw) || raw === 0) return { error: "badInput" };
    type = "ADJUSTMENT";
    amountUsd = round2(raw);
  } else {
    // A remittance is a positive amount of cash handed in, stored negative.
    if (!Number.isFinite(raw) || raw <= 0) return { error: "badInput" };
    type = "REMITTANCE";
    amountUsd = -round2(raw);
  }

  await prisma.$transaction([
    prisma.courierLedgerEntry.create({
      data: {
        courierId,
        type,
        amountUsd,
        note: note || null,
        createdById: adminId,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action:
          type === "REMITTANCE" ? "courier.remittance" : "courier.adjustment",
        entity: "User",
        entityId: courierId,
        meta: { amountUsd, note: note || undefined },
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/couriers/${courierId}`);
  revalidatePath(`/${locale}/admin/couriers`);
  return { ok: true };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
