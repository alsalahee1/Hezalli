import { getFormatter, getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  MapPin,
  PackageCheck,
  Wallet,
} from "lucide-react";

import { requireCourierId } from "@/lib/authz";
import { courierCashSummary } from "@/lib/courier-ledger";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";
import { dueBy as computeDueBy, slaState, slaWeight } from "@/lib/sla";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { LocationShare } from "@/components/driver/location-share";

export default async function DriverJobsPage() {
  const courierId = await requireCourierId();
  const t = await getTranslations("Driver");
  const tShip = await getTranslations("Orders");
  const format = await getFormatter();
  if (!courierId) return null;

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [rawJobs, settings, location, cash] = await Promise.all([
    prisma.shipment.findMany({
      where: { driverId: courierId, subOrder: { status: "SHIPPED" } },
      select: {
        id: true,
        status: true,
        shippedAt: true,
        subOrder: {
          select: {
            shippingMethod: true,
            store: { select: { name: true } },
            order: {
              select: {
                id: true,
                address: {
                  select: {
                    fullName: true,
                    city: true,
                    governorate: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    getPlatformSettings(),
    prisma.courierLocation.findUnique({
      where: { userId: courierId },
      select: { governorate: true },
    }),
    courierCashSummary(courierId),
  ]);

  const now = new Date();
  const jobs = rawJobs
    .map((j) => {
      const etaMax =
        j.subOrder.shippingMethod === "EXPRESS"
          ? settings.express_eta_max_days
          : settings.std_eta_max_days;
      const sla = j.shippedAt
        ? slaState(computeDueBy(j.shippedAt, etaMax), now)
        : "on_track";
      return { ...j, sla };
    })
    // Most urgent (overdue) first, then oldest.
    .sort(
      (a, b) =>
        slaWeight(a.sla) - slaWeight(b.sla) ||
        (a.shippedAt?.getTime() ?? 0) - (b.shippedAt?.getTime() ?? 0),
    );

  return (
    <div className="space-y-4">
      <LocationShare currentGovernorate={location?.governorate ?? null} />

      {/* Cash the driver is holding + fees earned. */}
      {cash.cashOnHand > 0 || cash.earnings > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-500">
              <Wallet className="size-3.5" /> {t("cashToRemit")}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {money(cash.cashOnHand)}
            </p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-muted-foreground text-xs font-medium">
              {t("earnings")}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {money(cash.earnings)}
            </p>
          </div>
        </div>
      ) : null}

      <div>
        <h1 className="text-lg font-semibold">{t("myJobs")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("jobsCount", { count: jobs.length })}
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
          <PackageCheck className="mx-auto mb-2 size-8 opacity-50" />
          {t("noJobs")}
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link
                href={`/driver/job/${j.id}`}
                className="hover:border-primary/50 flex items-center gap-3 rounded-xl border p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      #{j.subOrder.order.id.slice(-8).toUpperCase()}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] font-medium",
                        j.status === "OUT_FOR_DELIVERY"
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {tShip(`shipStatus_${j.status}`)}
                    </span>
                    {j.sla === "overdue" ? (
                      <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-600">
                        <AlertTriangle className="size-3" /> {t("overdue")}
                      </span>
                    ) : j.sla === "due_soon" ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-600">
                        <Clock className="size-3" /> {t("dueSoon")}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium">
                    {j.subOrder.order.address.fullName}
                  </p>
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    <MapPin className="size-3" />
                    {j.subOrder.order.address.city},{" "}
                    {j.subOrder.order.address.governorate}
                  </p>
                </div>
                <ChevronRight className="text-muted-foreground size-5 rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
