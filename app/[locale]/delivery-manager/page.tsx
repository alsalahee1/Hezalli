import {
  AlertTriangle,
  Banknote,
  Bike,
  CheckCircle2,
  HandCoins,
  MapPin,
  MapPinned,
  Package,
  PauseCircle,
  Truck,
  Undo2,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { getDeliveryAccess } from "@/lib/authz";
import { codExposureReport } from "@/lib/cod-guard";
import {
  DELIVERY_SCOPES,
  type DeliveryScope,
  accessHasScope,
} from "@/lib/delivery-access";
import { prisma } from "@/lib/prisma";
import { Forbidden } from "@/components/auth/forbidden";
import { Link } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

const STUCK_DAYS = 7;

type Card = {
  key: string;
  value: string;
  icon: LucideIcon;
  href: string;
  alert?: boolean;
};
type Section = { scope: DeliveryScope; cards: Card[] };

// Desk-aware landing: each team member opens on the work that is theirs — the
// Settlement desk sees cash & remittances, Fleet sees drivers, and so on. A
// Head of Delivery / ADMIN (access "ALL") sees every section stacked. Only the
// desks a member holds are queried, so a single-desk login stays cheap.
export default async function DeliveryManagerDashboardPage() {
  const t = await getTranslations("DeliveryManager");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const gate = await getDeliveryAccess();
  if (!gate) return <Forbidden />;
  const has = (s: DeliveryScope) => accessHasScope(gate.access, s);

  const builders: Record<DeliveryScope, () => Promise<Section>> = {
    DISPATCH: async () => {
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
      return {
        scope: "DISPATCH",
        cards: [
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
        ],
      };
    },
    FLEET: async () => {
      const [activeDrivers, pausedDrivers, pendingDriverApps] =
        await Promise.all([
          prisma.user.count({
            where: {
              roles: { has: "COURIER" },
              isSuspended: false,
              deletedAt: null,
              courierPausedAt: null,
            },
          }),
          prisma.user.count({
            where: {
              roles: { has: "COURIER" },
              deletedAt: null,
              courierPausedAt: { not: null },
            },
          }),
          prisma.courierApplication.count({ where: { status: "PENDING" } }),
        ]);
      return {
        scope: "FLEET",
        cards: [
          {
            key: "activeDrivers",
            value: String(activeDrivers),
            icon: Bike,
            href: "/delivery-manager/couriers",
          },
          {
            key: "pausedDrivers",
            value: String(pausedDrivers),
            icon: PauseCircle,
            href: "/delivery-manager/couriers",
            alert: pausedDrivers > 0,
          },
          {
            key: "pendingDriverApps",
            value: String(pendingDriverApps),
            icon: UserPlus,
            href: "/delivery-manager/couriers",
            alert: pendingDriverApps > 0,
          },
        ],
      };
    },
    POINTS: async () => {
      const [activePoints, pausedPoints, pendingPointApps] = await Promise.all([
        prisma.deliveryPoint.count({ where: { status: "ACTIVE" } }),
        prisma.deliveryPoint.count({ where: { pausedAt: { not: null } } }),
        prisma.deliveryPointApplication.count({ where: { status: "PENDING" } }),
      ]);
      return {
        scope: "POINTS",
        cards: [
          {
            key: "activePoints",
            value: String(activePoints),
            icon: MapPinned,
            href: "/delivery-manager/points",
          },
          {
            key: "pausedPoints",
            value: String(pausedPoints),
            icon: PauseCircle,
            href: "/delivery-manager/points",
            alert: pausedPoints > 0,
          },
          {
            key: "pendingPointApps",
            value: String(pendingPointApps),
            icon: UserPlus,
            href: "/delivery-manager/points",
            alert: pendingPointApps > 0,
          },
        ],
      };
    },
    SETTLEMENT: async () => {
      const [remit, exposure] = await Promise.all([
        prisma.remitClaim.aggregate({
          where: { status: "PENDING" },
          _count: true,
          _sum: { amountUsd: true },
        }),
        codExposureReport(),
      ]);
      const pendingRemits = remit._count;
      return {
        scope: "SETTLEMENT",
        cards: [
          {
            key: "pendingRemits",
            value: String(pendingRemits),
            icon: HandCoins,
            href: "/delivery-manager/remittances",
            alert: pendingRemits > 0,
          },
          {
            key: "remitAmount",
            value: money(Number(remit._sum.amountUsd ?? 0)),
            icon: Banknote,
            href: "/delivery-manager/remittances",
          },
          {
            key: "codOutstanding",
            value: money(exposure.totalOutstanding),
            icon: Banknote,
            href: "/delivery-manager/cash",
            alert: exposure.coverage < 1,
          },
        ],
      };
    },
    NETWORK: async () => {
      const [carriers, zones] = await Promise.all([
        prisma.carrier.count(),
        prisma.shippingZone.count(),
      ]);
      return {
        scope: "NETWORK",
        cards: [
          {
            key: "carriersCount",
            value: String(carriers),
            icon: Truck,
            href: "/delivery-manager/carriers",
          },
          {
            key: "zonesCount",
            value: String(zones),
            icon: MapPin,
            href: "/delivery-manager/shipping-zones",
          },
        ],
      };
    },
  };

  // Query only the desks this member holds, in a stable desk order.
  const desks = DELIVERY_SCOPES.filter(has);
  const sections = await Promise.all(desks.map((d) => builders[d]()));

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Truck className="text-primary size-6" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("overviewSubtitle")}
          </p>
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {t("emptyDesks")}
        </p>
      ) : (
        sections.map((section) => (
          <section key={section.scope} className="space-y-3">
            {/* Only label the section when several are stacked (Head of
                Delivery / admin); a single-desk login needs no divider. */}
            {sections.length > 1 ? (
              <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {t(`sec_${section.scope}`)}
              </h2>
            ) : null}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {section.cards.map((c) => {
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
          </section>
        ))
      )}
    </div>
  );
}
