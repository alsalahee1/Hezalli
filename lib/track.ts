// Shared read model for the public shipment-tracking views (the JSON polling
// endpoint and the SSE stream). PRIVACY: the courier's live position is only
// exposed while the parcel is actively OUT_FOR_DELIVERY, and only the single
// latest point — never a history trail.
import { prisma } from "@/lib/prisma";

export type TrackSnapshot = {
  status: string | null;
  driver: { lat: number; lng: number; updatedAt: string } | null;
  dest: { lat: number; lng: number } | null;
};

// A tracking number that never resolved to a shipment.
export const EMPTY_SNAPSHOT: TrackSnapshot = {
  status: null,
  driver: null,
  dest: null,
};

// Shipment statuses at which tracking is finished — the parcel has reached a
// terminal state, so a live stream can close.
const TERMINAL = new Set(["DELIVERED", "RETURNED"]);

export function isTerminalTracking(status: string | null): boolean {
  return status != null && TERMINAL.has(status);
}

// The one snapshot both tracking transports serve: destination pin (when the
// address is geocoded) plus the courier's point, but only during an active run.
export async function getTrackingSnapshot(
  tracking: string,
): Promise<TrackSnapshot> {
  const clean = tracking.trim();
  if (!clean) return EMPTY_SNAPSHOT;

  const shipment = await prisma.shipment.findFirst({
    where: { trackingNumber: clean },
    orderBy: { createdAt: "desc" },
    select: {
      status: true,
      driver: {
        select: {
          courierLocation: {
            select: { lat: true, lng: true, updatedAt: true },
          },
        },
      },
      subOrder: {
        select: {
          order: { select: { address: { select: { lat: true, lng: true } } } },
        },
      },
    },
  });
  if (!shipment) return EMPTY_SNAPSHOT;

  const addr = shipment.subOrder?.order.address;
  const dest =
    addr?.lat != null && addr?.lng != null
      ? { lat: addr.lat, lng: addr.lng }
      : null;

  // Only share the courier point during an active delivery run.
  const loc =
    shipment.status === "OUT_FOR_DELIVERY"
      ? shipment.driver?.courierLocation
      : null;
  const driver = loc
    ? { lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt.toISOString() }
    : null;

  return { status: shipment.status, driver, dest };
}
