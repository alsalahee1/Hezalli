"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { UserMinus } from "lucide-react";

import {
  assignCourierToFleet,
  removeCourierFromFleet,
  setFleetOwner,
} from "@/lib/actions/fleet";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { DriverStats } from "@/lib/fleet";

// Admin manages a fleet's roster: add a courier, set/clear the partner owner,
// and remove a driver. Read-only per-driver stats sit alongside.
export function FleetRoster({
  fleetId,
  drivers,
  ownerId,
  assignable,
}: {
  fleetId: string;
  drivers: DriverStats[];
  ownerId: string | null;
  assignable: { id: string; label: string }[];
}) {
  const t = useTranslations("AdminFleets");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState("");

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>) => {
    setErr(null);
    start(async () => {
      const res = await fn();
      if (res.error) setErr(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {/* Add a courier */}
      <div className="flex flex-wrap items-end gap-2">
        <select
          aria-label={t("addCourier")}
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="h-9 min-w-56 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">{t("addCourierPlaceholder")}</option>
          {assignable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          disabled={pending || !pick}
          onClick={() =>
            run(async () => {
              const res = await assignCourierToFleet({
                fleetId,
                courierId: pick,
              });
              if (!res.error) setPick("");
              return res;
            })
          }
        >
          {t("addCourier")}
        </Button>
        {assignable.length === 0 ? (
          <span className="text-muted-foreground text-xs">
            {t("noAssignable")}
          </span>
        ) : null}
      </div>

      {err ? (
        <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
      ) : null}

      {drivers.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("rosterEmpty")}</p>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {drivers.map((d) => (
              <li key={d.courierId} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium">{d.name}</span>
                    {d.courierId === ownerId ? (
                      <span className="ms-2 rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-400">
                        {t("owner")}
                      </span>
                    ) : null}
                    {d.suspended ? (
                      <span className="text-muted-foreground ms-2 text-xs">
                        {t("suspended")}
                      </span>
                    ) : null}
                  </div>
                  {d.rating != null ? (
                    <span className="shrink-0 text-xs font-medium text-amber-600">
                      ★ {d.rating.toFixed(1)}
                    </span>
                  ) : null}
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      {t("colActive")}
                    </dt>
                    <dd dir="ltr">{d.activeJobs}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      {t("colDelivered")}
                    </dt>
                    <dd dir="ltr">{d.delivered}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      {t("colCash")}
                    </dt>
                    <dd
                      className={cn(d.cashOnHand > 0 && "text-amber-600")}
                      dir="ltr"
                    >
                      {money(d.cashOnHand)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex items-center justify-end gap-3 border-t pt-3">
                  {d.courierId === ownerId ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() => setFleetOwner({ fleetId, courierId: null }))
                      }
                      className="text-muted-foreground hover:text-foreground text-xs underline"
                    >
                      {t("clearOwner")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          setFleetOwner({ fleetId, courierId: d.courierId }),
                        )
                      }
                      className="text-primary text-xs underline"
                    >
                      {t("makeOwner")}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={t("remove")}
                    title={t("remove")}
                    onClick={() =>
                      run(() =>
                        removeCourierFromFleet({ courierId: d.courierId }),
                      )
                    }
                    className="text-destructive hover:bg-destructive/10 rounded p-1"
                  >
                    <UserMinus className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
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
                  <th className="p-2 text-end font-medium">{t("colOwed")}</th>
                  <th className="p-2 text-end font-medium">{t("colRating")}</th>
                  <th className="p-2 text-end font-medium">{t("colManage")}</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.courierId} className="border-b last:border-0">
                    <td className="p-2">
                      <span className="font-medium">{d.name}</span>
                      {d.courierId === ownerId ? (
                        <span className="ms-2 rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-400">
                          {t("owner")}
                        </span>
                      ) : null}
                      {d.suspended ? (
                        <span className="text-muted-foreground ms-2 text-xs">
                          {t("suspended")}
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
                    <td className="p-2 text-end tabular-nums" dir="ltr">
                      {money(d.earningsOwed)}
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
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-2">
                        {d.courierId === ownerId ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                setFleetOwner({ fleetId, courierId: null }),
                              )
                            }
                            className="text-muted-foreground hover:text-foreground text-xs underline"
                          >
                            {t("clearOwner")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                setFleetOwner({
                                  fleetId,
                                  courierId: d.courierId,
                                }),
                              )
                            }
                            className="text-primary text-xs underline"
                          >
                            {t("makeOwner")}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={pending}
                          aria-label={t("remove")}
                          title={t("remove")}
                          onClick={() =>
                            run(() =>
                              removeCourierFromFleet({
                                courierId: d.courierId,
                              }),
                            )
                          }
                          className="text-destructive hover:bg-destructive/10 rounded p-1"
                        >
                          <UserMinus className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
