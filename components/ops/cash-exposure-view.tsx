import { getFormatter, getTranslations } from "next-intl/server";
import { Banknote, Bike, MapPinned, ShieldCheck } from "lucide-react";

import { codExposureReport, type ExposureHolder } from "@/lib/cod-guard";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";

// COD cash exposure (docs §40): one screen answering "how much of Hezalli's
// money is in other people's pockets right now?" — totals, an aging bar,
// collateral coverage, and the top holders. Served under /admin and
// /delivery-manager via `base`; callers own authorization.
export async function CashExposureView({ base }: { base: string }) {
  const t = await getTranslations("Exposure");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });
  const r = await codExposureReport();

  const tiles = [
    {
      key: "total",
      value: money(r.totalOutstanding),
      hint: t("totalHint", { count: r.holdersCount }),
      accent: "border-amber-500/40 bg-amber-500/5",
    },
    {
      key: "drivers",
      value: money(r.driverCash),
      hint: t("driversHint", { blocked: r.blockedDrivers }),
    },
    {
      key: "points",
      value: money(r.pointCash),
      hint: t("pointsHint", { blocked: r.blockedPoints }),
    },
    {
      key: "coverage",
      value: `${Math.round(r.coverage * 100)}%`,
      hint: t("coverageHint", { amount: money(r.totalCollateral) }),
      accent:
        r.coverage >= 1 ? "border-emerald-500/40 bg-emerald-500/5" : undefined,
    },
  ];

  const agingSegs = [
    { label: t("fresh"), value: r.fresh, cls: "bg-emerald-500" },
    { label: t("aging24"), value: r.aging24, cls: "bg-amber-500" },
    { label: t("aging48"), value: r.aging48, cls: "bg-rose-500" },
  ];
  const agingTotal = Math.max(r.totalOutstanding, 0.01);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Banknote className="text-primary size-6" /> {t("title")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((s) => (
          <div key={s.key} className={cn("rounded-xl border p-4", s.accent)}>
            <p className="text-muted-foreground text-xs">{t(s.key)}</p>
            <p className="mt-1 text-xl font-semibold" dir="ltr">
              {s.value}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">{s.hint}</p>
          </div>
        ))}
      </div>

      {/* Aging: how long the outstanding cash has been out, FIFO. */}
      <section className="space-y-2 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">{t("agingTitle")}</h2>
        <div className="bg-muted flex h-4 overflow-hidden rounded-full">
          {agingSegs.map((seg) =>
            seg.value > 0 ? (
              <div
                key={seg.label}
                className={seg.cls}
                style={{ width: `${(seg.value / agingTotal) * 100}%` }}
                title={`${seg.label}: ${money(seg.value)}`}
              />
            ) : null,
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {agingSegs.map((seg) => (
            <span key={seg.label} className="inline-flex items-center gap-1.5">
              <span
                className={cn("inline-block size-2.5 rounded-full", seg.cls)}
              />
              {seg.label}:{" "}
              <span className="font-semibold" dir="ltr">
                {money(seg.value)}
              </span>
            </span>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">{t("agingHint")}</p>
      </section>

      <HolderTable
        title={t("topDrivers")}
        icon="driver"
        holders={r.topDrivers}
        hrefBase={`${base}/couriers`}
        money={money}
        t={t}
      />
      <HolderTable
        title={t("topPoints")}
        icon="point"
        holders={r.topPoints}
        hrefBase={`${base}/points`}
        money={money}
        t={t}
      />

      {r.totalOutstanding <= 0 ? (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="me-1.5 inline size-4 align-text-bottom" />
          {t("allClear")}
        </p>
      ) : null}
    </div>
  );
}

function HolderTable({
  title,
  icon,
  holders,
  hrefBase,
  money,
  t,
}: {
  title: string;
  icon: "driver" | "point";
  holders: ExposureHolder[];
  hrefBase: string;
  money: (n: number) => string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  if (holders.length === 0) return null;
  const Icon = icon === "driver" ? Bike : MapPinned;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4" /> {title}
      </h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-xs">
              <th className="p-2 text-start font-medium">{t("colWho")}</th>
              <th className="p-2 text-end font-medium">{t("colCash")}</th>
              <th className="p-2 text-end font-medium">{t("colLimit")}</th>
              <th className="p-2 text-end font-medium">{t("colCollateral")}</th>
              <th className="p-2 text-end font-medium">{t("colOver24")}</th>
              <th className="p-2 text-end font-medium">{t("colOver48")}</th>
              <th className="p-2 text-start font-medium">{t("colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {holders.map((h) => (
              <tr key={h.id} className="border-b last:border-0">
                <td className="p-2">
                  <Link
                    href={`${hrefBase}/${h.id}`}
                    className="text-primary font-medium hover:underline"
                  >
                    {h.name}
                  </Link>
                </td>
                <td className="p-2 text-end font-semibold" dir="ltr">
                  {money(h.cashOnHand)}
                </td>
                <td className="text-muted-foreground p-2 text-end" dir="ltr">
                  {h.limit > 0 ? money(h.limit) : "—"}
                </td>
                <td className="text-muted-foreground p-2 text-end" dir="ltr">
                  {money(h.collateral)}
                </td>
                <td
                  className={cn(
                    "p-2 text-end",
                    h.overdue24 > 0 && "font-medium text-amber-600",
                  )}
                  dir="ltr"
                >
                  {h.overdue24 > 0 ? money(h.overdue24) : "—"}
                </td>
                <td
                  className={cn(
                    "p-2 text-end",
                    h.overdue48 > 0 && "font-medium text-rose-600",
                  )}
                  dir="ltr"
                >
                  {h.overdue48 > 0 ? money(h.overdue48) : "—"}
                </td>
                <td className="p-2">
                  {h.blocked ? (
                    <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-xs font-semibold text-rose-600">
                      {t("statusBlocked")}
                    </span>
                  ) : h.overdue24 > 0 ? (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600">
                      {t("statusWatch")}
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-600">
                      {t("statusOk")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
