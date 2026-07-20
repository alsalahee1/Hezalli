import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Live courier position for the public tracking page. PRIVACY: the driver's
// location is only exposed while the parcel is actively OUT_FOR_DELIVERY, and
// only the single latest point (no history). Returns nulls otherwise so the
// map simply doesn't render.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tracking: string }> },
) {
  const { tracking: raw } = await params;
  const tracking = decodeURIComponent(raw).trim();
  if (!tracking) return NextResponse.json({ driver: null, dest: null });

  const shipment = await prisma.shipment.findFirst({
    where: { trackingNumber: tracking },
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
          order: {
            select: { address: { select: { lat: true, lng: true } } },
          },
        },
      },
    },
  });

  const addr = shipment?.subOrder?.order.address;
  const dest =
    addr?.lat != null && addr?.lng != null
      ? { lat: addr.lat, lng: addr.lng }
      : null;

  // Only share the courier point during an active delivery run.
  const loc =
    shipment?.status === "OUT_FOR_DELIVERY"
      ? shipment.driver?.courierLocation
      : null;
  const driver = loc
    ? { lat: loc.lat, lng: loc.lng, updatedAt: loc.updatedAt.toISOString() }
    : null;

  return NextResponse.json(
    { driver, dest },
    { headers: { "Cache-Control": "no-store" } },
  );
}
