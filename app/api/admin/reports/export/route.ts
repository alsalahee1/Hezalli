import { requireAdminId } from "@/lib/authz";
import { csvCell } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

// CSV export of orders in a date range. Admin-only.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await requireAdminId())) {
    return new Response("Forbidden", { status: 403 });
  }
  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from") ?? "";
  const toStr = url.searchParams.get("to") ?? "";
  const from = new Date(fromStr + "T00:00:00");
  const to = new Date(toStr + "T23:59:59");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return new Response("Bad date range", { status: 400 });
  }

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      status: true,
      paymentMethod: true,
      itemsTotal: true,
      shippingTotal: true,
      discountTotal: true,
      grandTotal: true,
      buyer: { select: { name: true, email: true } },
    },
    take: 10000,
  });

  const header = [
    "order_id",
    "date",
    "status",
    "payment_method",
    "buyer",
    "email",
    "items_total",
    "shipping_total",
    "discount_total",
    "grand_total",
  ];
  const lines = [header.join(",")];
  for (const o of orders) {
    lines.push(
      [
        o.id,
        o.createdAt.toISOString(),
        o.status,
        o.paymentMethod,
        o.buyer.name ?? "",
        o.buyer.email ?? "",
        Number(o.itemsTotal).toFixed(2),
        Number(o.shippingTotal).toFixed(2),
        Number(o.discountTotal).toFixed(2),
        Number(o.grandTotal).toFixed(2),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // BOM so Excel opens UTF-8 (Arabic names) correctly.
  const body = "﻿" + lines.join("\r\n") + "\r\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hezalli-orders-${fromStr}_${toStr}.csv"`,
    },
  });
}
