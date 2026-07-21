import { getFormatter, getTranslations } from "next-intl/server";

import { requireFleetOwner } from "@/lib/authz";
import { fleetDetail } from "@/lib/fleet";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { cn } from "@/lib/utils";

// A fleet owner's read-only dashboard: rolled-up totals + a per-driver roster.
// No management controls — those live in the admin console.
export default async function FleetOwnerPage() {
  const locale = await getLocale();
  const owner = await requireFleetOwner();
  if (!owner) redirect({ href: "/", locale });

  const t = await getTranslations("Fleet");
  const format = await getFormatter();
  const fleet = await fleetDetail(owner!.fleetId);
  if (!fleet) redirect({ href: "/", locale });

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const cards: { key: string; value: string; accent?: boolean }[] = [
    { key: "drivers", value: String(fleet!.totals.drivers) },
    { key: "activeJobs", value: String(fleet!.totals.activeJobs) },
    { key: "delivered", value: String(fleet!.totals.delivered) },
    {
      key: "cashOnHand",
      value: money(fleet!.totals.cashOnHand),
      accent: fleet!.totals.cashOnHand > 0,
    },
    { key: "earningsOwed", value: money(fleet!.totals.earningsOwed) },
    {
      key: "rating",
      value:
        fleet!.totals.rating != null
          ? `★ ${fleet!.totals.rating.toFixed(1)}`
          : "—",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.key}
            className={cn(
              "rounded-xl border p-4",
              c.accent && "border-amber-500/40 bg-amber-500/5",
            )}
          >
            <p className="text-muted-foreground text-xs">{t(c.key)}</p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("rosterTitle")}</h2>
        {fleet!.drivers.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("rosterEmpty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th className="p-2 text-start font-medium">
                    {t("colDriver")}
                  </th>
                  <th className="p-2 text-end font-medium">{t("colActive")}</th>
                  <th className="p-2 text-end font-medium">
                    {t("colDelivered")}
                  </th>
                  <th className="p-2 text-end font-medium">{t("colCash")}</th>
                  <th className="p-2 text-end font-medium">{t("colRating")}</th>
                </tr>
              </thead>
              <tbody>
                {fleet!.drivers.map((d) => (
                  <tr key={d.courierId} className="border-b last:border-0">
                    <td className="p-2 font-medium">
                      {d.name}
                      {d.courierId === fleet!.ownerId ? (
                        <span className="ms-2 rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-400">
                          {t("you")}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-2 text-end tabular-nums" dir="ltr">
                      {d.activeJobs}
                    </td>
                    <td className="p-2 text-end tabular-nums" dir="ltr">
                      {d.delivered}
                    </td>
                    <td className="p-2 text-end tabular-nums" dir="ltr">
                      {d.cashOnHand > 0 ? (
                        <span className="text-amber-600">
                          {money(d.cashOnHand)}
                        </span>
                      ) : (
                        money(d.cashOnHand)
                      )}
                    </td>
                    <td className="p-2 text-end" dir="ltr">
                      {d.rating != null ? (
                        <span className="text-amber-600">
                          ★ {d.rating.toFixed(1)}
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
      </section>
    </div>
  );
}
