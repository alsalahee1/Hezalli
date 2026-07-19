import { getTranslations } from "next-intl/server";
import { ChevronRight, MapPin, PackageCheck } from "lucide-react";

import { requireCourierId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export default async function DriverJobsPage() {
  const courierId = await requireCourierId();
  const t = await getTranslations("Driver");
  const tShip = await getTranslations("Orders");
  if (!courierId) return null;

  const jobs = await prisma.shipment.findMany({
    where: { driverId: courierId, subOrder: { status: "SHIPPED" } },
    orderBy: [{ status: "asc" }, { shippedAt: "asc" }],
    select: {
      id: true,
      status: true,
      subOrder: {
        select: {
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
  });

  return (
    <div className="space-y-4">
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
