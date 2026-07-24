"use client";

import { useState, useTransition } from "react";
import { Check, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  savePointShelfZones,
  type ShelfRow,
} from "@/lib/actions/point-shelves";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Row = {
  letter: string;
  count: number;
  zone: string; // "" = general
  capacity: string; // "" = unlimited
};

// Per-row zone + capacity editor (owner/manager). Points arrange shelving by
// unit, so zones are set a whole row at a time: tag row A "pickup" (near the
// counter), rows B–D "dispatch" (near the door), a row for returns. The receive
// scan then routes each parcel to the matching area automatically.
export function ShelfZoneEditor({ rows }: { rows: ShelfRow[] }) {
  const t = useTranslations("Point");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [state, setState] = useState<Row[]>(
    rows.map((r) => ({
      letter: r.letter,
      count: r.count,
      zone: r.zone ?? "",
      capacity: r.capacity != null ? String(r.capacity) : "",
    })),
  );

  if (state.length === 0) return null;

  const set = (letter: string, patch: Partial<Row>) => {
    setSaved(false);
    setState((s) =>
      s.map((r) => (r.letter === letter ? { ...r, ...patch } : r)),
    );
  };

  const save = () =>
    start(async () => {
      const res = await savePointShelfZones(
        state.map((r) => ({
          letter: r.letter,
          zone: r.zone || null,
          capacity: r.capacity.trim() ? Number(r.capacity) : null,
        })),
      );
      if (res.ok) {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <div className="space-y-3 rounded-xl border p-3 print:hidden">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <LayoutGrid className="size-4" /> {t("shelfZonesTitle")}
        </p>
        <p className="text-muted-foreground text-xs">{t("shelfZonesHint")}</p>
      </div>

      <div className="space-y-2">
        {/* Column captions */}
        <div className="text-muted-foreground grid grid-cols-[2.5rem_1fr_5rem] items-center gap-2 px-1 text-[11px] font-medium">
          <span>{t("shelfZoneRow")}</span>
          <span>{t("shelfZoneArea")}</span>
          <span>{t("shelfZoneCap")}</span>
        </div>
        {state.map((r) => (
          <div
            key={r.letter}
            className="grid grid-cols-[2.5rem_1fr_5rem] items-center gap-2"
          >
            <span className="text-sm font-semibold" dir="ltr">
              {r.letter}
              <span className="text-muted-foreground ms-1 text-[11px] font-normal">
                ×{r.count}
              </span>
            </span>
            <Select
              value={r.zone}
              onChange={(e) => set(r.letter, { zone: e.target.value })}
              className="h-9 text-sm"
              aria-label={t("shelfZoneArea")}
            >
              <option value="">{t("shelfZoneGeneral")}</option>
              <option value="PICKUP">{t("shelfZonePickup")}</option>
              <option value="DISPATCH">{t("shelfZoneDispatch")}</option>
              <option value="RETURNS">{t("shelfZoneReturns")}</option>
            </Select>
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={r.capacity}
              onChange={(e) => set(r.letter, { capacity: e.target.value })}
              placeholder="∞"
              dir="ltr"
              className="h-9 text-sm"
              aria-label={t("shelfZoneCap")}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? t("saving") : t("shelfZonesSave")}
        </Button>
        {saved ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <Check className="size-3.5" /> {t("shelfZonesSaved")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
