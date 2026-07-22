/**
 * One-time backfill for the 2026-07 COD settlement fix.
 *
 * Before the fix, EVERY cash COD sub-order settled as COD_COMMISSION_DUE
 * ("the seller already holds the cash"). That shorted sellers whose cash was
 * actually collected by Hezalli Express (a courier/point COD_COLLECTED ledger
 * entry exists) or whose buyer had settled the COD order digitally — in both
 * cases the platform holds the money and owes the seller the sale principal.
 *
 * For each such sub-order this script credits the seller an ADJUSTMENT of
 * exactly what the buyer paid (items + shipping − discount): the difference
 * between the SALE credit they should have received and the
 * COD_COMMISSION_DUE they did receive. Sub-orders with any refund on record
 * are only reported, never auto-adjusted — their proration needs human eyes.
 *
 * Idempotent: each adjustment carries a marker note and is skipped on re-run.
 *
 * Run (dry-run by default):   npx tsx scripts/backfill-express-cod-settlement.ts
 * Apply for real:             npx tsx scripts/backfill-express-cod-settlement.ts --apply
 */
import "dotenv/config";

import { recomputeBalance, round2, subEconomics } from "../lib/finance";
import { codSettledDigitally } from "../lib/payment-state";
import { prisma } from "../lib/prisma";

const BACKFILL_NOTE = "Backfill 2026-07: COD principal held by platform";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(
    apply
      ? "APPLY mode — adjustments will be written.\n"
      : "Dry-run (pass --apply to write adjustments).\n",
  );

  // Every sub-order settled under the old cash-basis rule.
  const settled = await prisma.ledgerEntry.findMany({
    where: { type: "COD_COMMISSION_DUE", subOrderId: { not: null } },
    select: {
      balanceId: true,
      subOrderId: true,
      amountUsd: true,
      balance: { select: { sellerId: true } },
    },
  });
  console.log(`COD_COMMISSION_DUE settlements found: ${settled.length}`);
  if (settled.length === 0) return;

  const subIds = settled.map((e) => e.subOrderId!);
  const [byCourier, byPoint, adjusted, refunded] = await Promise.all([
    prisma.courierLedgerEntry.findMany({
      where: { subOrderId: { in: subIds }, type: "COD_COLLECTED" },
      select: { subOrderId: true },
    }),
    prisma.deliveryPointLedgerEntry.findMany({
      where: { subOrderId: { in: subIds }, type: "COD_COLLECTED" },
      select: { subOrderId: true },
    }),
    // Already backfilled on a previous run.
    prisma.ledgerEntry.findMany({
      where: {
        subOrderId: { in: subIds },
        type: "ADJUSTMENT",
        note: { startsWith: BACKFILL_NOTE },
      },
      select: { subOrderId: true },
    }),
    prisma.refund.findMany({
      where: { subOrderId: { in: subIds } },
      select: { subOrderId: true },
    }),
  ]);
  const platformCollected = new Set(
    [...byCourier, ...byPoint].map((e) => e.subOrderId),
  );
  const alreadyDone = new Set(adjusted.map((e) => e.subOrderId));
  const hasRefund = new Set(refunded.map((r) => r.subOrderId));

  const subs = await prisma.subOrder.findMany({
    where: { id: { in: subIds } },
    select: {
      id: true,
      itemsTotal: true,
      shippingTotal: true,
      discountTotal: true,
      commissionRate: true,
      order: {
        select: {
          paymentMethod: true,
          payment: { select: { status: true, confirmedBy: true } },
          coupon: { select: { scope: true } },
        },
      },
    },
  });
  const subById = new Map(subs.map((s) => [s.id, s]));

  let owedCount = 0;
  let owedTotal = 0;
  const sellerIds = new Set<string>();
  const needsReview: string[] = [];

  for (const entry of settled) {
    const subOrderId = entry.subOrderId!;
    const sub = subById.get(subOrderId);
    if (!sub) continue;

    // Would today's rules have settled this as a SALE?
    const owed =
      platformCollected.has(subOrderId) || codSettledDigitally(sub.order);
    if (!owed) continue;
    if (alreadyDone.has(subOrderId)) {
      console.log(`  = ${subOrderId} already backfilled — skipped`);
      continue;
    }
    if (hasRefund.has(subOrderId)) {
      needsReview.push(subOrderId);
      continue;
    }

    // SALE(sellerNet) − COD_COMMISSION_DUE(codLedger) = what the buyer paid.
    const eco = subEconomics(
      Number(sub.itemsTotal),
      Number(sub.shippingTotal),
      Number(sub.commissionRate),
      Number(sub.discountTotal),
      sub.order.coupon?.scope === "SELLER",
    );
    const amount = eco.paid;
    if (!(amount > 0)) continue;

    owedCount += 1;
    owedTotal = round2(owedTotal + amount);
    console.log(
      `  + ${subOrderId}: credit $${amount.toFixed(2)} ` +
        `(${platformCollected.has(subOrderId) ? "Express-collected" : "paid digitally"})`,
    );

    if (apply) {
      await prisma.ledgerEntry.create({
        data: {
          balanceId: entry.balanceId,
          type: "ADJUSTMENT",
          amountUsd: amount,
          subOrderId,
          note: `${BACKFILL_NOTE} — principal credited (items + shipping − discount)`,
        },
      });
      sellerIds.add(entry.balance.sellerId);
    }
  }

  if (apply) {
    for (const sellerId of sellerIds) await recomputeBalance(sellerId);
  }

  console.log(
    `\n${apply ? "Credited" : "Would credit"} ${owedCount} sub-order(s), ` +
      `$${owedTotal.toFixed(2)} total, across ${apply ? sellerIds.size : "their"} seller balance(s).`,
  );
  if (needsReview.length > 0) {
    console.log(
      `\nNEEDS MANUAL REVIEW (refunds on record — not auto-adjusted):\n` +
        needsReview.map((id) => `  ! ${id}`).join("\n"),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
