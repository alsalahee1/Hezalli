// Stuck-shipment sweep: flags parcels that sat un-moved past the threshold and
// alerts delivery staff (DELIVERY_MANAGER + ADMIN). stuckFlaggedAt is the
// last-alerted timestamp: a parcel alerts when first stuck and then again
// every REALERT_HOURS while still un-moved — an ignored alert must not be the
// end of the chain (docs/AUDIT-LIFECYCLE-2026-07-22.md GAP-5). A staff status
// override clears the flag so a re-stuck parcel starts a fresh cycle.
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

const STUCK_DAYS = 7;
const REALERT_HOURS = 48;
const BATCH = 200;

export async function sweepStuckShipments(): Promise<{ flagged: number }> {
  const cutoff = new Date(Date.now() - STUCK_DAYS * 86_400_000);
  const realertCutoff = new Date(Date.now() - REALERT_HOURS * 3_600_000);

  const stuck = await prisma.shipment.findMany({
    where: {
      status: { in: ["PENDING", "LABEL_CREATED", "PICKED_UP", "IN_TRANSIT"] },
      updatedAt: { lt: cutoff },
      OR: [
        { stuckFlaggedAt: null },
        { stuckFlaggedAt: { lt: realertCutoff } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: BATCH,
    select: { id: true },
  });
  if (stuck.length === 0) return { flagged: 0 };

  // Stamp the alert time first, then notify — a notify failure must not cause
  // the next run to re-spam before REALERT_HOURS, and updatedAt must not move
  // (it drives stuckness).
  await prisma.shipment.updateMany({
    where: { id: { in: stuck.map((s) => s.id) } },
    data: { stuckFlaggedAt: new Date() },
  });

  const staff = await prisma.user.findMany({
    where: {
      isSuspended: false,
      deletedAt: null,
      roles: { hasSome: ["DELIVERY_MANAGER", "ADMIN"] },
    },
    select: { id: true, locale: true },
  });

  await Promise.all(
    staff.map((u) => {
      const ar = u.locale === "ar";
      return notify({
        userId: u.id,
        type: "SHIPMENT",
        title: ar
          ? `${stuck.length} شحنة متعثرة منذ ${STUCK_DAYS}+ أيام`
          : `${stuck.length} shipment(s) stuck for ${STUCK_DAYS}+ days`,
        body: ar
          ? "شحنات لم تتحرك منذ فترة طويلة وتحتاج إلى تدخل."
          : "Parcels that have not moved in a while and need attention.",
        link: "/delivery-manager/shipments?stuck=1",
      }).catch(() => {});
    }),
  );

  return { flagged: stuck.length };
}
