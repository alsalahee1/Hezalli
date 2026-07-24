import { getTranslations } from "next-intl/server";
import { AlertTriangle, Boxes, Clock, PackageX } from "lucide-react";

import type { ShelfMonitorBay, ShelfZone } from "@/lib/point-shelves";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// The wall-board view of every registered bay: a spatial grid grouped by area
// with a colour per bay (empty / filling / full) and an amber ring on any bay
// holding a parcel that's overstayed the stale threshold — the "how old" that
// actually drives action. Read-only, derived live from held parcels; a small
// client poll (AutoRefresh) keeps a mounted tablet current. Server component.
export async function ShelfMonitor({
  bays,
  staleDays,
}: {
  bays: ShelfMonitorBay[];
  staleDays: number;
}) {
  const t = await getTranslations("Point");

  // No bays registered yet — point at the set-up flow instead of a blank grid.
  if (bays.length === 0) {
    return (
      <div className="space-y-3 rounded-xl border border-dashed p-6 text-center">
        <Boxes className="text-muted-foreground mx-auto size-8" />
        <p className="text-sm font-semibold">{t("monitorEmptyTitle")}</p>
        <p className="text-muted-foreground mx-auto max-w-sm text-xs">
          {t("monitorEmptyBody")}
        </p>
        <Link
          href="/point/labels"
          className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
        >
          {t("monitorEmptyCta")}
        </Link>
      </div>
    );
  }

  const totalHeld = bays.reduce((n, b) => n + b.load, 0);
  const baysFull = bays.filter(
    (b) => b.capacity != null && b.load >= b.capacity,
  ).length;
  const baysUsed = bays.filter((b) => b.load > 0).length;
  const agingParcels = bays.reduce((n, b) => n + b.agedCount, 0);
  const oldest = bays.reduce((m, b) => Math.max(m, b.oldestAgeDays ?? 0), 0);

  const groups: { key: ShelfZone | "GENERAL"; label: string }[] = [
    { key: "PICKUP", label: t("shelfZonePickup") },
    { key: "DISPATCH", label: t("shelfZoneDispatch") },
    { key: "RETURNS", label: t("shelfZoneReturns") },
    { key: "GENERAL", label: t("shelfZoneGeneral") },
  ];

  return (
    <div className="space-y-5">
      {/* Summary strip — the numbers a manager should read first, aging loudest. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile
          icon={<Boxes className="size-4" />}
          value={String(totalHeld)}
          label={t("monitorHeld")}
          sub={t("monitorBaysUsed", { used: baysUsed, total: bays.length })}
        />
        <Tile
          icon={<PackageX className="size-4" />}
          value={String(baysFull)}
          label={t("monitorFull")}
          tone={baysFull > 0 ? "red" : undefined}
        />
        <Tile
          icon={<AlertTriangle className="size-4" />}
          value={String(agingParcels)}
          label={t("monitorAging")}
          tone={agingParcels > 0 ? "amber" : undefined}
        />
        <Tile
          icon={<Clock className="size-4" />}
          value={oldest > 0 ? t("monitorDays", { days: oldest }) : "—"}
          label={t("monitorOldest")}
          tone={oldest >= staleDays && oldest > 0 ? "amber" : undefined}
        />
      </div>

      {/* Bay grid, laid out by area so the board reads like the room. */}
      <div className="space-y-4">
        {groups.map((g) => {
          const inZone = bays.filter((b) => (b.zone ?? "GENERAL") === g.key);
          if (inZone.length === 0) return null;
          return (
            <div key={g.key} className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">
                {g.label}
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {inZone.map((b) => (
                  <BayCard key={b.code} bay={b} t={t} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend so the colours read without training. */}
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]">
        <Swatch className="bg-emerald-500/70" label={t("monitorKeyFilling")} />
        <Swatch className="bg-red-500/70" label={t("monitorKeyFull")} />
        <Swatch
          className="bg-amber-500/70 ring-2 ring-amber-500/50"
          label={t("monitorKeyAging")}
        />
        <Swatch className="border border-dashed" label={t("monitorKeyEmpty")} />
      </div>
    </div>
  );
}

function BayCard({
  bay,
  t,
}: {
  bay: ShelfMonitorBay;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const full = bay.capacity != null && bay.load >= bay.capacity;
  const has = bay.load > 0;
  const aging = bay.agedCount > 0;

  // Base tone from occupancy; the aging ring layers on top so a full+old bay
  // shows both (red body, amber ring).
  const base = full
    ? "border-red-500/40 bg-red-500/10"
    : has
      ? "border-emerald-500/40 bg-emerald-500/10"
      : "border-dashed";
  const bar = full ? "bg-red-500/70" : "bg-emerald-500/70";
  const pct =
    bay.capacity != null
      ? Math.min(100, Math.round((bay.load / bay.capacity) * 100))
      : has
        ? 100
        : 0;

  return (
    <div
      className={cn(
        "relative flex flex-col gap-1.5 rounded-lg border p-2",
        base,
        aging && "ring-2 ring-amber-500/60",
      )}
      dir="ltr"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-sm font-semibold tabular-nums">{bay.code}</span>
        {aging && bay.oldestAgeDays != null && (
          <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1 py-px text-[10px] font-semibold text-amber-700 tabular-nums dark:text-amber-400">
            <Clock className="size-2.5" />
            {t("monitorDays", { days: bay.oldestAgeDays })}
          </span>
        )}
      </div>

      {/* Fill meter. */}
      <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full", bar)}
          style={{ width: `${pct}%` }}
        />
      </div>

      <span className="text-muted-foreground text-[11px] tabular-nums">
        {bay.capacity != null ? `${bay.load}/${bay.capacity}` : bay.load}
      </span>
    </div>
  );
}

function Tile({
  icon,
  value,
  label,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  sub?: string;
  tone?: "red" | "amber";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        tone === "red" && "border-red-500/40 bg-red-500/5",
        tone === "amber" && "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <p
        className={cn(
          "text-muted-foreground flex items-center gap-1 text-[11px] font-medium",
          tone === "red" && "text-red-600 dark:text-red-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-muted-foreground text-[11px]">{sub}</p>}
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-3 rounded", className)} />
      {label}
    </span>
  );
}
