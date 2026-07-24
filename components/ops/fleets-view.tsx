import { getFormatter, getTranslations } from "next-intl/server";
import { Truck } from "lucide-react";

import { requireDeliveryScope } from "@/lib/authz";
import { listFleetsWithStats } from "@/lib/fleet";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { Forbidden } from "@/components/auth/forbidden";
import { FleetCreateForm } from "@/components/admin/fleet-create-form";

// Admin fleet console: every fleet-partner with rolled-up figures, plus a
// create form. Each row links to the fleet's roster + settings.
export async function FleetsView({ base }: { base: string }) {
  const adminId = await requireDeliveryScope("FLEET");
  if (!adminId) return <Forbidden />;
  const t = await getTranslations("AdminFleets");
  const format = await getFormatter();
  const fleets = await listFleetsWithStats();

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Truck className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </div>
      <p className="text-muted-foreground -mt-4 text-sm">{t("desc")}</p>

      <section className="rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-semibold">{t("createTitle")}</h2>
        <FleetCreateForm />
      </section>

      {fleets.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                <th className="p-2 text-start font-medium">{t("colFleet")}</th>
                <th className="p-2 text-end font-medium">{t("colDrivers")}</th>
                <th className="p-2 text-end font-medium">{t("colActive")}</th>
                <th className="p-2 text-end font-medium">
                  {t("colDelivered")}
                </th>
                <th className="p-2 text-end font-medium">{t("colCash")}</th>
                <th className="p-2 text-end font-medium">{t("colOwed")}</th>
                <th className="p-2 text-end font-medium">{t("colRating")}</th>
              </tr>
            </thead>
            <tbody>
              {fleets.map((f) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="p-2">
                    <Link
                      href={`${base}/fleets/${f.id}`}
                      className="font-medium hover:underline"
                    >
                      {f.name}
                    </Link>
                    {!f.isActive ? (
                      <span className="text-muted-foreground ms-2 text-xs">
                        {t("inactive")}
                      </span>
                    ) : null}
                    {f.ownerName ? (
                      <span className="text-muted-foreground block text-xs">
                        {t("ownerLabel")}: {f.ownerName}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">
                    {f.totals.drivers}
                  </td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">
                    {f.totals.activeJobs}
                  </td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">
                    {f.totals.delivered}
                  </td>
                  <td
                    className={cn(
                      "p-2 text-end tabular-nums",
                      f.totals.cashOnHand > 0 && "text-amber-600",
                    )}
                    dir="ltr"
                  >
                    {money(f.totals.cashOnHand)}
                  </td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">
                    {money(f.totals.earningsOwed)}
                  </td>
                  <td className="p-2 text-end" dir="ltr">
                    {f.totals.rating != null ? (
                      <span className="text-amber-600">
                        ★ {f.totals.rating.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
