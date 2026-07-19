"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { round2 } from "@/lib/finance";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

export type RateInput = {
  zoneId: string;
  feeUsd: number | null; // null → don't ship here via own rate (platform default)
  freeOver: number | null;
  // Optional express-tier price for this zone. null → use the platform default
  // express fee. Only persisted when a standard feeUsd is set for the zone.
  expressFeeUsd: number | null;
};

// Reconcile a seller's per-zone shipping rates: upsert those with a fee,
// delete the rest so they fall back to the platform default.
export async function saveShippingRates(rates: RateInput[]): Promise<Result> {
  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };
  const locale = await getLocale();
  const storeId = gate.storeId;

  const validZones = new Set(
    (await prisma.shippingZone.findMany({ select: { id: true } })).map(
      (z) => z.id,
    ),
  );

  const ops = [];
  for (const r of rates) {
    if (!validZones.has(r.zoneId)) continue;
    if (r.feeUsd == null || r.feeUsd < 0 || Number.isNaN(r.feeUsd)) {
      ops.push(
        prisma.shippingRate.deleteMany({
          where: { storeId, zoneId: r.zoneId },
        }),
      );
      continue;
    }
    const fee = round2(r.feeUsd);
    const freeOver =
      r.freeOver != null && r.freeOver > 0 ? round2(r.freeOver) : null;
    const expressFeeUsd =
      r.expressFeeUsd != null &&
      r.expressFeeUsd >= 0 &&
      !Number.isNaN(r.expressFeeUsd)
        ? round2(r.expressFeeUsd)
        : null;
    ops.push(
      prisma.shippingRate.upsert({
        where: { storeId_zoneId: { storeId, zoneId: r.zoneId } },
        create: {
          storeId,
          zoneId: r.zoneId,
          feeUsd: fee,
          freeOver,
          expressFeeUsd,
        },
        update: { feeUsd: fee, freeOver, expressFeeUsd },
      }),
    );
  }
  await prisma.$transaction(ops);

  revalidatePath(`/${locale}/seller/settings/shipping`);
  return { ok: true };
}
