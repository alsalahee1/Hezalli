import { getTranslations } from "next-intl/server";
import { Truck } from "lucide-react";

import { requireDeliveryScope } from "@/lib/authz";
import {
  effectiveVehicleCapacity,
  VEHICLE_CAPACITY_SETTING_KEY,
} from "@/lib/courier-capacity";
import { prisma } from "@/lib/prisma";
import { VEHICLE_TYPES } from "@/lib/validations/courier";
import { Forbidden } from "@/components/auth/forbidden";
import { VehicleCapacityRow } from "@/components/admin/vehicle-capacity-row";

// Delivery staff tune what each vehicle class can carry — the table
// auto-assignment checks parcels against. Values are live (no deploy);
// resetting a vehicle returns it to the shipped defaults.
export async function VehicleCapacityView() {
  const staffId = await requireDeliveryScope("FLEET");
  if (!staffId) return <Forbidden />;
  const t = await getTranslations("AdminCouriers");

  const [table, row] = await Promise.all([
    effectiveVehicleCapacity(),
    prisma.platformSetting.findUnique({
      where: { key: VEHICLE_CAPACITY_SETTING_KEY },
      select: { value: true },
    }),
  ]);
  const overrides =
    typeof row?.value === "object" && row.value !== null
      ? (row.value as Record<string, unknown>)
      : {};

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Truck className="size-5" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("capacityTitle")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("capacityHint")}</p>
        </div>
      </div>

      <div className="space-y-3">
        {VEHICLE_TYPES.map((v) => {
          const cap = table[v];
          if (!cap) return null;
          return (
            <div
              key={v}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="min-w-32 text-sm">
                <p className="font-medium">{t(`vehicle_${v}`)}</p>
                {v in overrides ? (
                  <p className="text-xs text-violet-700 dark:text-violet-400">
                    {t("capCustom")}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    {t("capDefault")}
                  </p>
                )}
              </div>
              <VehicleCapacityRow
                vehicleType={v}
                maxWeightKg={cap.maxWeightGrams / 1000}
                maxVolumeLiters={cap.maxVolumeCm3 / 1000}
                maxParcels={cap.maxParcels}
                maxItemLongestSideCm={cap.maxItemLongestSideCm}
                overridden={v in overrides}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
