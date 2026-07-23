import { NextResponse } from "next/server";

import { requireDeliveryManagerId } from "@/lib/authz";
import { csvCell } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

// CSV export of the shipments list, honouring the same filters as the
// delivery-manager shipments page (status, stuck, q). Capped at 5000 rows.
export const dynamic = "force-dynamic";

const STATUSES = [
  "PENDING",
  "LABEL_CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "AT_POINT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNED_TO_POINT",
  "RETURNED",
] as const;

const STUCK_DAYS = 7;

export async function GET(req: Request) {
  const staffId = await requireDeliveryManagerId();
  if (!staffId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const stuck = url.searchParams.get("stuck");
  const query = url.searchParams.get("q")?.trim() || "";
  const activeStatus = STATUSES.includes(status as never) ? status : undefined;

  const shipments = await prisma.shipment.findMany({
    where: {
      ...(activeStatus ? { status: activeStatus as never } : {}),
      ...(stuck === "1"
        ? {
            status: {
              in: ["PENDING", "LABEL_CREATED", "PICKED_UP", "IN_TRANSIT"],
            },
            updatedAt: { lt: new Date(Date.now() - STUCK_DAYS * 86_400_000) },
          }
        : {}),
      ...(query
        ? {
            OR: [
              { trackingNumber: { contains: query, mode: "insensitive" } },
              {
                subOrder: {
                  order: {
                    buyer: { name: { contains: query, mode: "insensitive" } },
                  },
                },
              },
              {
                subOrder: {
                  store: { name: { contains: query, mode: "insensitive" } },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 5000,
    select: {
      id: true,
      status: true,
      trackingNumber: true,
      platformManaged: true,
      attemptCount: true,
      shippedAt: true,
      deliveredAt: true,
      updatedAt: true,
      carrier: { select: { name: true } },
      driver: { select: { name: true } },
      subOrder: {
        select: {
          id: true,
          status: true,
          store: { select: { name: true } },
          order: {
            select: {
              buyer: { select: { name: true } },
              address: { select: { governorate: true, city: true } },
            },
          },
        },
      },
    },
  });

  const header = [
    "shipment_id",
    "suborder",
    "status",
    "suborder_status",
    "store",
    "buyer",
    "governorate",
    "city",
    "carrier",
    "courier",
    "tracking",
    "platform_managed",
    "attempts",
    "shipped_at",
    "delivered_at",
    "updated_at",
  ].join(",");

  const lines = shipments.map((s) =>
    [
      s.id,
      s.subOrder.id,
      s.status,
      s.subOrder.status,
      csvCell(s.subOrder.store.name),
      csvCell(s.subOrder.order.buyer.name),
      csvCell(s.subOrder.order.address.governorate),
      csvCell(s.subOrder.order.address.city),
      csvCell(s.carrier?.name),
      csvCell(s.driver?.name),
      csvCell(s.trackingNumber),
      s.platformManaged ? "yes" : "no",
      String(s.attemptCount),
      s.shippedAt?.toISOString() ?? "",
      s.deliveredAt?.toISOString() ?? "",
      s.updatedAt.toISOString(),
    ].join(","),
  );

  return new NextResponse([header, ...lines].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="shipments.csv"',
    },
  });
}
