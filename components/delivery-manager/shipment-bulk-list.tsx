"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  bulkOverrideShipmentStatus,
  type OverrideStatus,
} from "@/lib/actions/shipment-admin";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const STATUSES: OverrideStatus[] = [
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNED",
];

const STATUS_TONE: Record<string, string> = {
  DELIVERED: "bg-emerald-500/10 text-emerald-600",
  FAILED: "bg-destructive/10 text-destructive",
  RETURNED: "bg-destructive/10 text-destructive",
  IN_TRANSIT: "bg-sky-500/10 text-sky-600",
  AT_POINT: "bg-violet-500/10 text-violet-600",
  OUT_FOR_DELIVERY: "bg-sky-500/10 text-sky-600",
  RETURNED_TO_POINT: "bg-destructive/10 text-destructive",
};

export type ShipmentRow = {
  id: string;
  code: string;
  storeName: string;
  platformManaged: boolean;
  metaLine: string;
  status: string;
  updatedLabel: string;
};

// Shipments list with multi-select: checkboxes per row plus a bulk status bar.
// Selection is page-local (clears on navigation), which is the safe default
// for a destructive-ish bulk operation.
export function ShipmentBulkList({ rows }: { rows: ShipmentRow[] }) {
  const t = useTranslations("DeliveryManager");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<OverrideStatus>("IN_TRANSIT");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = () =>
    start(async () => {
      setResult(null);
      const res = await bulkOverrideShipmentStatus(
        [...sel],
        status,
        note.trim() || undefined,
      );
      if (res.error) setResult(t(`error_${res.error}`));
      else {
        setResult(
          t("bulkResult", { changed: res.changed, skipped: res.skipped }),
        );
        setSel(new Set());
        setNote("");
        router.refresh();
      }
    });

  return (
    <div className="space-y-3">
      {sel.size > 0 ? (
        <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          <span className="font-medium">
            {t("bulkSelected", { count: sel.size })}
          </span>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as OverrideStatus)}
            className="w-auto"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`shipStatus_${s}`)}
              </option>
            ))}
          </Select>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("eventNote")}
            className="max-w-xs flex-1"
          />
          <Button size="sm" disabled={pending} onClick={apply}>
            {t("bulkApply")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setSel(new Set())}
          >
            {t("bulkClear")}
          </Button>
        </div>
      ) : null}
      {result ? (
        <p className="text-muted-foreground text-xs">{result}</p>
      ) : null}

      <ul className="divide-y rounded-lg border">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center gap-2 ps-3">
            <input
              type="checkbox"
              className="size-4 shrink-0"
              checked={sel.has(s.id)}
              onChange={() => toggle(s.id)}
              aria-label={s.code}
            />
            <Link
              href={`/delivery-manager/shipments/${s.id}`}
              className="hover:bg-muted/50 flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 px-2 py-3 text-sm transition-colors"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {s.code} · {s.storeName}
                  {s.platformManaged ? (
                    <span className="bg-primary/10 text-primary ms-2 rounded-full px-2 py-0.5 text-xs font-medium">
                      {t("platformManaged")}
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {s.metaLine}
                </p>
              </div>
              <div className="text-end">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    STATUS_TONE[s.status] ?? "bg-muted text-muted-foreground",
                  )}
                >
                  {t(`shipStatus_${s.status}`)}
                </span>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {s.updatedLabel}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
