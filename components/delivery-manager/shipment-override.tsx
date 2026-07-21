"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  editShipmentTracking,
  overrideShipmentStatus,
  type OverrideStatus,
} from "@/lib/actions/shipment-admin";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUSES: OverrideStatus[] = [
  "PENDING",
  "LABEL_CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "AT_POINT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNED_TO_POINT",
  "RETURNED",
];

// Staff overrides on a shipment: set the status (appends a tracking event;
// DELIVERED cascades to the sub-order) and correct the carrier / tracking.
export function ShipmentOverride({
  shipmentId,
  currentStatus,
  carrierId,
  trackingNumber,
  carriers,
}: {
  shipmentId: string;
  currentStatus: string;
  carrierId: string | null;
  trackingNumber: string | null;
  carriers: { id: string; name: string }[];
}) {
  const t = useTranslations("DeliveryManager");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(currentStatus);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [carrier, setCarrier] = useState(carrierId ?? "");
  const [tracking, setTracking] = useState(trackingNumber ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>) =>
    start(async () => {
      setErr(null);
      setDone(false);
      const res = await fn();
      if (res.error) setErr(t(`error_${res.error}`));
      else {
        setDone(true);
        setLocation("");
        setNote("");
        router.refresh();
      }
    });

  const selectClass =
    "border-input bg-background h-9 rounded-md border px-2 text-sm";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">{t("setStatus")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`shipStatus_${s}`)}
              </option>
            ))}
          </select>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("eventLocation")}
            className="h-9 w-36"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("eventNote")}
            className="h-9 max-w-xs flex-1"
          />
          <Button
            size="sm"
            disabled={pending || status === currentStatus}
            onClick={() =>
              run(() =>
                overrideShipmentStatus(shipmentId, status as OverrideStatus, {
                  location,
                  note,
                }),
              )
            }
          >
            {t("apply")}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">{t("setStatusHint")}</p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">{t("editTracking")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className={selectClass}
          >
            <option value="">{t("chooseCarrier")}</option>
            {carriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Input
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
            placeholder={t("trackingNumber")}
            dir="ltr"
            className="h-9 w-44"
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(() => editShipmentTracking(shipmentId, carrier, tracking))
            }
          >
            {t("save")}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">{t("editTrackingHint")}</p>
      </div>

      {err ? (
        <p className="text-destructive text-xs lg:col-span-2">{err}</p>
      ) : null}
      {done ? (
        <p className="text-xs text-emerald-600 lg:col-span-2">{t("saved")}</p>
      ) : null}
    </div>
  );
}
