"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

// Admin records a payout to a point operator (negative ledger row reducing the
// balance Hezalli owes the point) or a manual ± ADJUSTMENT. Both are audited.
// Mirrors lib/actions/courier-ledger.ts.
export async function recordPointPayout(formData: FormData): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };

  const pointId = String(formData.get("pointId") ?? "");
  const kind = String(formData.get("kind") ?? "payout"); // payout | adjustment
  const raw = Number(formData.get("amount"));
  const note = String(formData.get("note") ?? "").trim();
  if (!pointId) return { error: "badInput" };

  const point = await prisma.deliveryPoint.findUnique({
    where: { id: pointId },
    select: { id: true },
  });
  if (!point) return { error: "notPoint" };

  let type: "PAYOUT" | "ADJUSTMENT";
  let amountUsd: number;
  if (kind === "adjustment") {
    // A signed correction (may be + or −). Reject zero.
    if (!Number.isFinite(raw) || raw === 0) return { error: "badInput" };
    type = "ADJUSTMENT";
    amountUsd = round2(raw);
  } else {
    // A payout is a positive amount paid to the operator, stored negative.
    if (!Number.isFinite(raw) || raw <= 0) return { error: "badInput" };
    type = "PAYOUT";
    amountUsd = -round2(raw);
  }

  await prisma.$transaction([
    prisma.deliveryPointLedgerEntry.create({
      data: {
        pointId,
        type,
        amountUsd,
        note: note || null,
        createdById: adminId,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: type === "PAYOUT" ? "point.payout" : "point.adjustment",
        entity: "DeliveryPoint",
        entityId: pointId,
        meta: { amountUsd, note: note || undefined },
      },
    }),
  ]);

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/points/${pointId}`);
  revalidatePath(`/${locale}/admin/points`);
  return { ok: true };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
