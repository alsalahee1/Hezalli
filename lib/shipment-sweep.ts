// Stuck-shipment sweep: flags parcels that sat un-moved past the threshold and
// alerts delivery staff (DELIVERY_MANAGER + ADMIN) once per parcel. The
// one-shot stuckFlaggedAt guard makes re-runs harmless; a staff status
// override clears it so a re-stuck parcel alerts again.
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

const STUCK_DAYS = 7;
const BATCH = 200;

export async function sweepStuckShipments(): Promise<{ flagged: number }> {
  const cutoff = new Date(Date.now() - STUCK_DAYS * 86_400_000);

  const stuck = await prisma.shipment.findMany({
    where: {
      status: { in: ["PENDING", "LABEL_CREATED", "PICKED_UP", "IN_TRANSIT"] },
      updatedAt: { lt: cutoff },
      stuckFlaggedAt: null,
    },
    orderBy: { updatedAt: "asc" },
    take: BATCH,
    select: { id: true },
  });
  if (stuck.length === 0) return { flagged: 0 };

  // Flag first (one-shot), then notify — a notify failure must not cause the
  // next run to re-spam, and updatedAt must not move (it drives stuckness).
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
