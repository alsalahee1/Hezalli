import {
  AlertTriangle,
  CheckCircle2,
  Package,
  Truck,
  Undo2,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

const STUCK_DAYS = 7;

export default async function DeliveryManagerDashboardPage() {
  const t = await getTranslations("DeliveryManager");

  const stuckBefore = new Date(Date.now() - STUCK_DAYS * 86_400_000);
  const [inTransit, outForDelivery, stuck, failed, deliveredWeek] =
    await Promise.all([
      prisma.shipment.count({
        where: { status: { in: ["PICKED_UP", "IN_TRANSIT"] } },
      }),
      prisma.shipment.count({ where: { status: "OUT_FOR_DELIVERY" } }),
      prisma.shipment.count({
        where: {
          status: {
            in: ["PENDING", "LABEL_CREATED", "PICKED_UP", "IN_TRANSIT"],
          },
          updatedAt: { lt: stuckBefore },
        },
      }),
      prisma.shipment.count({
        where: { status: { in: ["FAILED", "RETURNED"] } },
      }),
      prisma.shipment.count({
        where: {
          status: "DELIVERED",
          deliveredAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
        },
      }),
    ]);

  const cards = [
    {
      key: "inTransit",
      value: String(inTransit),
      icon: Truck,
      href: "/delivery-manager/shipments?status=IN_TRANSIT",
    },
    {
      key: "outForDelivery",
      value: String(outForDelivery),
      icon: Package,
      href: "/delivery-manager/shipments?status=OUT_FOR_DELIVERY",
    },
    {
      key: "stuck",
      value: String(stuck),
      icon: AlertTriangle,
      href: "/delivery-manager/shipments?stuck=1",
      alert: stuck > 0,
    },
    {
      key: "failed",
      value: String(failed),
      icon: Undo2,
      href: "/delivery-manager/shipments?status=FAILED",
    },
    {
      key: "deliveredWeek",
      value: String(deliveredWeek),
      icon: CheckCircle2,
      href: "/delivery-manager/shipments?status=DELIVERED",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Truck className="text-primary size-6" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.key} href={c.href} className="block">
              <div className="bg-card hover:bg-muted/50 rounded-lg border p-4 transition-colors">
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Icon
                    className={`size-4 ${c.alert ? "text-destructive" : ""}`}
                  />{" "}
                  {t(c.key)}
                </div>
                <p
                  className={`mt-1 text-2xl font-semibold ${c.alert ? "text-destructive" : ""}`}
                  dir="ltr"
                >
                  {c.value}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
