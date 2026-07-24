import { getTranslations } from "next-intl/server";
import { Boxes, ChevronRight } from "lucide-react";

import type { ShelfLoad, ShelfZone } from "@/lib/point-shelves";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

// At-a-glance occupancy of every registered bay, grouped by area, so the
// counter sees where there's room before shelving. Read-only; derived live from
// held parcels. Server component.
export async function ShelfOccupancy({ loads }: { loads: ShelfLoad[] }) {
  const t = await getTranslations("Point");
  if (loads.length === 0) return null;

  // Group order: the working areas first, general bays last.
  const groups: { key: ShelfZone | "GENERAL"; label: string }[] = [
    { key: "PICKUP", label: t("shelfZonePickup") },
    { key: "DISPATCH", label: t("shelfZoneDispatch") },
    { key: "RETURNS", label: t("shelfZoneReturns") },
    { key: "GENERAL", label: t("shelfZoneGeneral") },
  ];

  const total = loads.reduce((n, b) => n + b.load, 0);

  return (
    <div className="space-y-3 rounded-xl border p-3 print:hidden">
      <Link
        href="/point/shelves"
        className="hover:bg-muted/40 -m-1 flex items-start gap-2 rounded-lg p-1 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Boxes className="size-4" /> {t("shelfLoadTitle")}
          </p>
          <p className="text-muted-foreground text-xs">
            {t("shelfLoadSummary", { parcels: total, bays: loads.length })}
          </p>
        </div>
        <ChevronRight className="text-muted-foreground size-4 shrink-0 rtl:rotate-180" />
      </Link>

      <div className="space-y-3">
        {groups.map((g) => {
          const bays = loads.filter((b) => (b.zone ?? "GENERAL") === g.key);
          if (bays.length === 0) return null;
          return (
            <div key={g.key} className="space-y-1.5">
              <p className="text-muted-foreground text-[11px] font-medium">
                {g.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {bays.map((b) => {
                  const full = b.capacity != null && b.load >= b.capacity;
                  const has = b.load > 0;
                  return (
                    <span
                      key={b.code}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium tabular-nums",
                        full
                          ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
                          : has
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "text-muted-foreground border-dashed",
                      )}
                      dir="ltr"
                    >
                      <span className="font-semibold">{b.code}</span>
                      <span>
                        {b.capacity != null
                          ? `${b.load}/${b.capacity}`
                          : b.load}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
